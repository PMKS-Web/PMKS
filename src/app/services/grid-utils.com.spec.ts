import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { fourBarDrivenAtFixture } from '../../test-utils/verification/fixtures';
import { ComAnchor, RealLink } from '../model/link';
import { GridUtilsService } from './grid-utils.service';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { StringTranscoder } from './transcoding/string-transcoder';

describe('committing a dragged center of mass at a paused pose', () => {
  for (const anchor of ['centroid', 'grid', { joint: 'A' }] as ComAnchor[]) {
    it(`keeps the dragged point and the start pose with anchor ${JSON.stringify(anchor)}`, () => {
      const h = createMechanismHarness();
      const decoder = new StringTranscoder();
      decoder.decodeURL(fixturePayload(fourBarDrivenAtFixture('A')));
      new MechanismBuilder(h.service, decoder, h.settings, h.active).build();
      const link = h.service.links.find((link) => link.id === 'ACT') as RealLink;
      link.comAnchor = anchor;
      link.captureComOffset();
      h.service.updateMechanism();
      const start = h.service.mechanisms[0].joints[0].map(({ x, y }) => ({ x, y }));
      const seconds = h.service.mechanisms[0].cyclePeriod * 0.217;
      h.service.seekMechanism(0, seconds);
      const point = { x: link.CoM.x + 40, y: link.CoM.y - 25 };
      link.placeCustomCoM(point);
      const saves = h.saveCount();
      const edit = h.injector.get(GridUtilsService);

      edit.commitCenterOfMass(link, true);

      expect(link.CoM.x).toBeCloseTo(point.x, 1);
      expect(link.CoM.y).toBeCloseTo(point.y, 1);
      expect(link.comAnchor).toEqual(anchor);
      expect(h.saveCount()).toBe(saves + 1);
      h.service.mechanisms[0].joints[0].forEach((joint, index) => {
        expect(joint.x).toBeCloseTo(start[index].x, 8);
        expect(joint.y).toBeCloseTo(start[index].y, 8);
      });

      h.service.seekMechanism(0, 0);
      const authored = { x: link.CoM.x, y: link.CoM.y };
      // A later rebuild must read the new offsets in the chosen editing
      // reference, rather than reuse a joint/grid offset from mid-cycle.
      h.service.updateMechanism();
      expect(link.CoM.x).toBeCloseTo(authored.x, 8);
      expect(link.CoM.y).toBeCloseTo(authored.y, 8);
      h.service.seekMechanism(0, seconds);
      expect(link.CoM.x).toBeCloseTo(point.x, 1);
      expect(link.CoM.y).toBeCloseTo(point.y, 1);
    });
  }
});
