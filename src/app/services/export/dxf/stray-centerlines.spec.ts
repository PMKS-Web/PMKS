import { buildMechanismFixture } from '../../../../tests/fixtures/mechanism-fixtures';
import { TEMPLATE_LINKAGES } from '../../../component/MODALS/templates/template-linkages';
import { buildMechanism } from '../../../../test-utils/verification/fixture';
import { FIXTURE_GALLERY } from '../../../../test-utils/verification/fixture-gallery';
import { Force } from '../../../model/force';
import { Joint } from '../../../model/joint';
import { Link, RealLink } from '../../../model/link';
import { DxfEntity, DxfLine, DxfPoint } from './dxf-model';
import { MODEL_SCALE } from '../../../model/render-scale';
import { DXF_PRESETS, NEUTRAL_DXF_OPTIONS } from './dxf-options';
import { buildSemanticDxf, centimetersIn, DXF_LAYER, originShift } from './semantic-dxf';

/**
 * A body exported as an outline is not drawn a second time as a centerline.
 *
 * Two bars welded in line used to be merged into one axis keyed `CD+DE`, and
 * the check that drops the centerlines of outlined bodies knew only `CD` and
 * `DE` -- so the Scotch yoke's rod, the hydraulic crosshead and the steam
 * locomotive each kept a bare line straight through a part already exported
 * whole (#292). No published mechanism has a body collapsed onto one point,
 * which is the one thing allowed to keep a centerline under Build parts.
 */
function centerlinesUnderBuildParts(joints: Joint[], links: Link[], forces: Force[]): number {
  const options = { ...NEUTRAL_DXF_OPTIONS, ...DXF_PRESETS.build };
  const { entities } = buildSemanticDxf({
    joints,
    links,
    forces,
    lengthUnit: 'cm',
    defaultInputClockwise: false,
    options,
  });
  const shared = entities.filter(
    (entity) => entity.type === 'LINE' && entity.layer === DXF_LAYER.links
  ).length;
  return shared + linesAlongABody(entities, joints, links, options);
}

/**
 * Lines on any layer that run from one joint of a body to another, sliders
 * included.
 *
 * Build moves a centerline that matches a body's axis onto a layer of that
 * body's own -- a welded leaf's included, which carries no outline of its own
 * -- so a returning centerline need never reach the shared layer counted
 * above. Measured against the joints, in the exporter's own coordinates,
 * rather than against the holes, because a slider's end has no hole.
 */
function linesAlongABody(
  entities: DxfEntity[],
  joints: Joint[],
  links: Link[],
  choices: { origin: string; originJointId?: string }
): number {
  const unitScale = centimetersIn('cm') / MODEL_SCALE;
  const shift = originShift({ joints }, choices, unitScale);
  const at = (joint: Joint): DxfPoint => ({
    x: joint.x * unitScale - shift.x,
    y: joint.y * unitScale - shift.y,
  });
  const bodies: RealLink[] = [];
  const visit = (link: Link) => {
    if (!(link instanceof RealLink)) return;
    bodies.push(link);
    link.subset.forEach(visit);
  };
  links.forEach(visit);
  const near = (a: DxfPoint, b: DxfPoint) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
  const along = (line: DxfLine, body: RealLink) =>
    body.joints.some((from, i) =>
      body.joints.some((to, j) => i !== j && near(line.start, at(from)) && near(line.end, at(to)))
    );
  return entities.filter(
    (entity): entity is DxfLine =>
      entity.type === 'LINE' && bodies.some((body) => along(entity, body))
  ).length;
}

describe('Build parts leaves no centerline beside an outline', () => {
  FIXTURE_GALLERY.forEach((entry) => {
    it(`in ${entry.name}`, () => {
      const built = buildMechanism(entry.fixture);
      expect(centerlinesUnderBuildParts(built.joints, built.links, built.forces)).toBe(0);
    });
  });

  Object.entries(TEMPLATE_LINKAGES).forEach(([name, payload]) => {
    it(`in the ${name} library card`, () => {
      const { service } = buildMechanismFixture(payload);
      // This builder never renders, and a welded body's outline is the one
      // the canvas builds when it draws it: build it here as the canvas would,
      // or every compound reads as collapsed and keeps its centerline.
      service.links.forEach((link) => {
        if (link instanceof RealLink && link.subset.length > 0) link.getCompoundPathString();
      });
      expect(centerlinesUnderBuildParts(service.joints, service.links, service.forces)).toBe(0);
    });
  });
});
