import { buildMechanismFixture } from '../../../../tests/fixtures/mechanism-fixtures';
import { TEMPLATE_LINKAGES } from '../../../component/MODALS/templates/template-linkages';
import { buildMechanism } from '../../../../test-utils/verification/fixture';
import { FIXTURE_GALLERY } from '../../../../test-utils/verification/fixture-gallery';
import { Force } from '../../../model/force';
import { Joint } from '../../../model/joint';
import { Link, RealLink } from '../../../model/link';
import { DxfCircle, DxfEntity, DxfPoint } from './dxf-model';
import { DXF_PRESETS, NEUTRAL_DXF_OPTIONS } from './dxf-options';
import { buildSemanticDxf, DXF_LAYER } from './semantic-dxf';

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
  const { entities } = buildSemanticDxf({
    joints,
    links,
    forces,
    lengthUnit: 'cm',
    defaultInputClockwise: false,
    options: { ...NEUTRAL_DXF_OPTIONS, ...DXF_PRESETS.build },
  });
  const shared = entities.filter(
    (entity) => entity.type === 'LINE' && entity.layer === DXF_LAYER.links
  ).length;
  return shared + axesOnOutlinedLayers(entities);
}

/**
 * Lines from one joint hole to another on a part's own layer that also holds
 * its outline.
 *
 * Build moves a centerline that matches one body's axis onto that body's
 * layer, so a returning per-body centerline would never reach the shared
 * layer counted above. A weld mark is not hole to hole, and a body collapsed
 * onto a line keeps its centerline on a layer with no outline, so neither is
 * counted.
 */
function axesOnOutlinedLayers(entities: DxfEntity[]): number {
  const near = (a: DxfPoint, b: DxfPoint) => Math.hypot(a.x - b.x, a.y - b.y) < 1e-6;
  const outlined = new Set(
    entities.filter((entity) => entity.type === 'POLYLINE').map((entity) => entity.layer)
  );
  return entities.filter((entity) => {
    if (entity.type !== 'LINE' || !outlined.has(entity.layer)) return false;
    const holes = entities.filter(
      (other): other is DxfCircle => other.type === 'CIRCLE' && other.layer === entity.layer
    );
    const atHole = (point: DxfPoint) => holes.some((hole) => near(hole.center, point));
    return atHole(entity.start) && atHole(entity.end);
  }).length;
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
