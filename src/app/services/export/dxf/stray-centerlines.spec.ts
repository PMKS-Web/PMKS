import { buildMechanismFixture } from '../../../../tests/fixtures/mechanism-fixtures';
import { TEMPLATE_LINKAGES } from '../../../component/MODALS/templates/template-linkages';
import { buildMechanism } from '../../../../test-utils/verification/fixture';
import { FIXTURE_GALLERY } from '../../../../test-utils/verification/fixture-gallery';
import { Force } from '../../../model/force';
import { Joint } from '../../../model/joint';
import { Link, RealLink } from '../../../model/link';
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
  return buildSemanticDxf({
    joints,
    links,
    forces,
    lengthUnit: 'cm',
    defaultInputClockwise: false,
    options: { ...NEUTRAL_DXF_OPTIONS, ...DXF_PRESETS.build },
  }).entities.filter((entity) => entity.type === 'LINE' && entity.layer === DXF_LAYER.links).length;
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
