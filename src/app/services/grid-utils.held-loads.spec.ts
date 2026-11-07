import { Coord } from '../model/coord';
import { RealJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { offsetLoadFourBarFixture } from '../../test-utils/verification/force-fixtures';
import { fixturePayload } from '../../test-utils/verification/fixture-gallery';
import { MechanismBuilder } from './transcoding/mechanism-builder';
import { StringTranscoder } from './transcoding/string-transcoder';
import { GridUtilsService } from './grid-utils.service';

/** A published loaded plate, with its anchor inside so containment cannot mask missing transport. */
function scene() {
  const harness = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(fixturePayload(offsetLoadFourBarFixture()));
  new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build();
  const plate = harness.service.links.find((link) => link.id === 'CDL') as RealLink;
  const neighbor = harness.service.links.find((link) => link.id === 'BC') as RealLink;
  const force = harness.service.forces[0];
  force.moveAnchor(plate.CoM);
  harness.service.updateMechanism();
  return { ...harness, plate, neighbor, force, grid: harness.injector.get(GridUtilsService) };
}

const endpoints = (force: ReturnType<typeof scene>['force']) => [
  { x: force.startCoord.x, y: force.startCoord.y },
  { x: force.endCoord.x, y: force.endCoord.y },
];

describe('loads on a body dragged through neighboring holds', () => {
  it('carries both force endpoints through a permitted rigid translation', () => {
    const { plate, neighbor, force, grid } = scene();
    neighbor.hold = 'angle';
    const before = endpoints(force);
    const dx = (neighbor.joints[1].x - neighbor.joints[0].x) / 20;
    const dy = (neighbor.joints[1].y - neighbor.joints[0].y) / 20;
    const joints = plate.joints.map(({ x, y }) => ({ x, y }));
    grid.dragLink(plate, dx, dy);
    plate.joints.forEach((joint, index) => {
      expect(joint.x).toBeCloseTo(joints[index].x + dx, 4);
      expect(joint.y).toBeCloseTo(joints[index].y + dy, 4);
    });
    endpoints(force).forEach((point, index) => {
      expect(point.x).toBeCloseTo(before[index].x + dx, 4);
      expect(point.y).toBeCloseTo(before[index].y + dy, 4);
    });
  });

  it('turns the force with a permitted rigid rotation', () => {
    const { plate, neighbor, force, grid } = scene();
    neighbor.hold = 'length';
    const pivot = new Coord(neighbor.joints[0].x, neighbor.joints[0].y);
    const before = endpoints(force);
    const theta = 0.02;
    grid.rotateLink(plate, pivot, theta);
    endpoints(force).forEach((point, index) => {
      const dx = before[index].x - pivot.x;
      const dy = before[index].y - pivot.y;
      expect(point.x).toBeCloseTo(pivot.x + dx * Math.cos(theta) - dy * Math.sin(theta), 4);
      expect(point.y).toBeCloseTo(pivot.y + dx * Math.sin(theta) + dy * Math.cos(theta), 4);
    });
  });

  it('carries a binary link load once despite intermediate per-joint writes', () => {
    const { plate, neighbor, force, grid } = scene();
    plate.forces = [];
    neighbor.forces = [force];
    force.link = neighbor;
    force.moveAnchor(neighbor.CoM);
    neighbor.hold = 'angle';
    const before = endpoints(force);
    grid.dragLink(neighbor, 3, 4);
    endpoints(force).forEach((point, index) => {
      expect(point.x).toBeCloseTo(before[index].x + 3, 4);
      expect(point.y).toBeCloseTo(before[index].y + 4, 4);
    });
  });

  it('leaves an interior load fixed when the hold makes the plate deform', () => {
    const { plate, neighbor, force, grid } = scene();
    neighbor.hold = 'angle';
    (neighbor.joints[0] as RealJoint).locked = true;
    const before = endpoints(force);
    const span = Math.hypot(
      plate.joints[1].x - plate.joints[0].x,
      plate.joints[1].y - plate.joints[0].y
    );
    grid.dragLink(plate, 0, 5);
    expect(
      Math.abs(
        Math.hypot(plate.joints[1].x - plate.joints[0].x, plate.joints[1].y - plate.joints[0].y) -
          span
      )
    ).toBeGreaterThan(0.1);
    endpoints(force).forEach((point, index) => {
      expect(point.x).toBeCloseTo(before[index].x, 4);
      expect(point.y).toBeCloseTo(before[index].y, 4);
    });
  });
});
