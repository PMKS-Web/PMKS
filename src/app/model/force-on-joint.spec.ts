import './joint';
import { PrisJoint, RevJoint } from './joint';
import { RealLink } from './link';
import {
  forceOffRefusedJoint,
  holdOffJoint,
  refuseForceOnJoint,
  refusedJointAt,
} from './force-on-joint';

/** A link through `joints`, listed on each of them, as the drawing keeps it. */
function wire(id: string, joints: RevJoint[]): RealLink {
  const link = new RealLink(id, joints);
  joints.forEach((joint) => joint.links.push(link));
  return link;
}

describe('which joints a force may sit on', () => {
  it('lets a force sit on a tracer point, a joint on one link and nothing else', () => {
    const a = new RevJoint('A', 0, 0);
    const t = new RevJoint('T', 4, 0);
    wire('AT', [a, t]);
    expect(refuseForceOnJoint(t)).toBeUndefined();
  });

  it('refuses a joint two links meet at', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 4, 0);
    const c = new RevJoint('C', 4, 3);
    wire('AB', [a, b]);
    wire('BC', [b, c]);
    expect(refuseForceOnJoint(b)?.code).toBe('shared');
    expect(refuseForceOnJoint(b)?.short).toBe('2 links share it');
  });

  // Issue #138: the ground is a second body, so a grounded pin on one link
  // is as ambiguous as one two links share. An input is grounded too.
  it('refuses a grounded joint, input or not, even on one link', () => {
    const o = new RevJoint('O', 0, 0, false, true);
    const driven = new RevJoint('A', 0, 0, true, true);
    wire('OT', [o, new RevJoint('T', 4, 0)]);
    wire('AB', [driven, new RevJoint('B', 4, 0)]);
    expect(refuseForceOnJoint(o)?.code).toBe('grounded');
    expect(refuseForceOnJoint(driven)?.code).toBe('grounded');
    expect(refuseForceOnJoint(o)?.long).toContain('joint O');
  });

  it('refuses a slider, whose slot is the second body', () => {
    const c = new PrisJoint('C', 0, 0);
    c.links.push(new RealLink('BC', [new RevJoint('B', 0, 3), c]));
    expect(refuseForceOnJoint(c)?.code).toBe('slider');
  });

  it('allows the joints of one welded body, which are on one link', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 4, 0);
    const c = new RevJoint('C', 4, 3);
    const first = new RealLink('AB', [a, b]);
    const second = new RealLink('BC', [b, c]);
    const compound = new RealLink('ABC', [a, b, c], undefined, undefined, undefined, [
      first,
      second,
    ]);
    [a, b, c].forEach((joint) => joint.links.push(compound));
    b.isWelded = true;
    expect(refuseForceOnJoint(b)).toBeUndefined();
  });
});

describe('moving a force off a joint that refuses it', () => {
  function crane() {
    const o = new RevJoint('O', 0, 0, false, true);
    const t = new RevJoint('T', 4, 0);
    const boom = wire('OT', [o, t]);
    return { o, t, boom };
  }

  it('finds the refused joint a point is on, and ignores a tracer point', () => {
    const { o, boom } = crane();
    expect(refusedJointAt(boom, { x: 0.01, y: 0 }, 0.1)).toBe(o);
    expect(refusedJointAt(boom, { x: 4, y: 0 }, 0.1)).toBeUndefined();
    expect(refusedJointAt(boom, { x: 2, y: 0 }, 0.1)).toBeUndefined();
  });

  it('moves the force along its bar, toward the other end, by the margin', () => {
    const { o, boom } = crane();
    const off = forceOffRefusedJoint(boom, { x: 0, y: 0 }, 0.1, 0.5);
    expect(off?.joint).toBe(o);
    expect(off?.to.x).toBeCloseTo(0.5, 9);
    expect(off?.to.y).toBeCloseTo(0, 9);
  });

  it('never carries the load past the middle of a short bar', () => {
    const { boom } = crane();
    const off = forceOffRefusedJoint(boom, { x: 0, y: 0 }, 0.1, 10);
    expect(off?.to.x).toBeCloseTo(2, 9);
  });

  // The derrick crane's luffing pin is halfway along its boom, where the
  // boom's middle is the pin itself and gives no direction to move in.
  it('moves a load off a pin halfway along a boom to the side it came from', () => {
    const o = new RevJoint('O', 0, 0, false, true);
    const c = new RevJoint('C', 3, 0);
    const t = new RevJoint('T', 6, 0);
    const boom = wire('OCT', [o, c, t]);
    wire('CK', [c, new RevJoint('K', 3, -2)]);
    expect(holdOffJoint(boom, c, { x: 3.01, y: 0 }, 0.5).x).toBeCloseTo(3.5, 9);
    expect(holdOffJoint(boom, c, { x: 2.99, y: 0 }, 0.5).x).toBeCloseTo(2.5, 9);
    expect(forceOffRefusedJoint(boom, { x: 3, y: 0 }, 0.1, 0.5)?.joint).toBe(c);
  });

  it('leaves a force alone that is already off the joint', () => {
    const { boom } = crane();
    expect(forceOffRefusedJoint(boom, { x: 2, y: 0 }, 0.1, 0.5)).toBeUndefined();
  });

  it('moves a force on a plate’s corner into the plate', () => {
    const a = new RevJoint('A', 0, 0, false, true);
    const plate = wire('ABC', [a, new RevJoint('B', 4, 0), new RevJoint('C', 0, 4)]);
    const to = holdOffJoint(plate, a, { x: 0, y: 0 }, 0.5);
    expect(Math.hypot(to.x, to.y)).toBeCloseTo(0.5, 9);
    expect(to.x).toBeGreaterThan(0);
    expect(to.y).toBeGreaterThan(0);
  });
});
