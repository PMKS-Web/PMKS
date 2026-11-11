// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { RealJoint } from '../../app/model/joint';
import { TEMPLATE_LINKAGES } from '../../app/component/MODALS/templates/template-linkages';
import { DEV_TEMPLATES } from '../../app/component/MODALS/templates/dev-templates';
import { refuseForceOnJoint } from '../../app/model/force-on-joint';
import { barHalfWidth } from '../../app/model/joint-marks';
import { SettingsService } from '../../app/services/settings.service';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';

/**
 * No template puts a load on a joint where a second body meets its link.
 *
 * A force belongs to one link. Where another link meets it, or the ground, or
 * a slider's slot, a load says nothing about which body carries it, and the
 * app has no gesture that sets one down there (`model/force-on-joint.ts`,
 * issue #138). A template that did would hand a student a load they could not
 * draw, and the rebuild would move it on opening and say so. Read off the
 * published payload rather than the rebuilt drawing, since the rebuild is what
 * would hide it, and counted as on the joint while the application point is
 * inside the pin's end cap, because that is where it looks as if it is.
 */
describe('where a template applies its loads', () => {
  const templates: Record<string, string> = { ...TEMPLATE_LINKAGES, ...DEV_TEMPLATES };
  for (const [id, payload] of Object.entries(templates)) {
    it(`keeps every load in ${id} off the joints that refuse one`, () => {
      const { service } = buildMechanismFixture(payload);
      const reach = barHalfWidth(SettingsService.objectScale);
      const onRefused = service.forces.flatMap((force) =>
        service.joints
          .filter((joint) => joint instanceof RealJoint && !!refuseForceOnJoint(joint))
          .filter(
            (joint) =>
              Math.hypot(force.startCoord.x - joint.x, force.startCoord.y - joint.y) < reach
          )
          .map((joint) => `${force.name || force.id} on ${joint.id}`)
      );
      expect(onRefused).toEqual([]);
    });
  }
});
