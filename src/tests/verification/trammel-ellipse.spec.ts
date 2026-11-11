// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { buildMechanism } from '../../test-utils/verification/fixture';
import {
  crankedTrammelFixture,
  ellipticalTrammelFixture,
} from '../../test-utils/verification/slot-fixtures';
import { MODEL_SCALE } from '../../app/model/render-scale';

// Test-ladder case 6. The trammel was in this suite for its *mobility* only --
// it proves a grounded guide anchors a mechanism nothing is pinned to -- and
// the exact curve it is famous for went unasserted.
//
// A bar with one end on each of two perpendicular guides carries every point of
// itself around an ellipse. With the bar of length L and the point d from the
// end riding the x axis:
//
//   x = p (L - d) / L,  y = q d / L,  p^2 + q^2 = L^2
//   =>  x^2 / (L - d)^2  +  y^2 / d^2  =  1
//
// Nothing in the mechanism mentions an ellipse, which is the point: it is a
// curve the solver was never told about.

const S = MODEL_SCALE;
const L = Math.hypot(1, 1); // A at (1,0), B at (0,1), in user units
const D = L / 3; // T sits a third of the way along, from A

describe('an elliptical trammel', () => {
  const { mechanism } = buildMechanism(ellipticalTrammelFixture(true, S));

  it('solves, now that one of its slides is driven', () => {
    expect(mechanism.dof).toBe(1);
    expect(mechanism.joints.length).toBeGreaterThan(10);
  });

  it('keeps the two ends on a circle of the bar\u2019s own length', () => {
    // p^2 + q^2 = L^2 is the trammel's defining property, and the exact one:
    // it involves only the joints the guides hold, with no tracer in between.
    for (const frame of mechanism.joints) {
      const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
      const p = at('A').x / S;
      const q = at('B').y / S;
      expect(Math.hypot(p, q)).toBeCloseTo(L, 5);
    }
  });

  it('carries its point around an ellipse', () => {
    const semiMajor = L - D;
    const semiMinor = D;
    for (const frame of mechanism.joints) {
      const tracer: Joint = frame.find((joint) => joint.id === 'T')!;
      const x = tracer.x / S;
      const y = tracer.y / S;
      const onEllipse = (x * x) / (semiMajor * semiMajor) + (y * y) / (semiMinor * semiMinor);
      // Not to the last decimal, and the reason is the tracer rather than the
      // trammel: a point *on* the bar is placed from circles about A and B
      // that are internally tangent there, which is the one configuration the
      // two-circle primitive is ill-conditioned in. The curve is right; the
      // last three digits of a collinear tracer are not.
      expect(Math.abs(onEllipse - 1)).toBeLessThan(2e-3);
    }
  });

  it('keeps each end on its own guide', () => {
    for (const frame of mechanism.joints) {
      const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
      // A rides the x axis, B the y axis, for the whole motion.
      expect(Math.abs(at('A').y / S)).toBeLessThan(1e-6);
      expect(Math.abs(at('B').x / S)).toBeLessThan(1e-6);
    }
  });

  it('keeps the bar the length it was drawn', () => {
    for (const frame of mechanism.joints) {
      const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
      expect(Math.hypot(at('A').x - at('B').x, at('A').y - at('B').y) / S).toBeCloseTo(L, 4);
    }
  });
});

// The library's trammel. A drive on a block runs out and back over the half of
// the ellipse on one side of its guide: at the end of the block's travel the
// bar lies along that guide, and the other block could go either way. A crank
// and rod turning the middle of the bar has no such end, so the traced point
// goes round the whole curve.
describe('an elliptical trammel driven by a crank and rod', () => {
  // A at (2,0), B at (0,2): twice the driven trammel, T a third along from A.
  const bar = 2 * L;
  const semiMajor = (2 / 3) * bar;
  const semiMinor = bar / 3;

  /** How far the crank turned over the whole cycle, in radians. */
  const crankSwept = (frames: Joint[][]): number => {
    const angle = (frame: Joint[]) => {
      const pivot = frame.find((joint) => joint.id === 'O')!;
      const pin = frame.find((joint) => joint.id === 'C')!;
      return Math.atan2(pin.y - pivot.y, pin.x - pivot.x);
    };
    let swept = 0;
    for (let step = 1; step < frames.length; step++) {
      let increment = angle(frames[step]) - angle(frames[step - 1]);
      while (increment > Math.PI) increment -= 2 * Math.PI;
      while (increment < -Math.PI) increment += 2 * Math.PI;
      swept += increment;
    }
    return swept;
  };

  it('turns the crank all the way round, and loops', () => {
    const { mechanism } = buildMechanism(crankedTrammelFixture(S), 'adaptive');
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.dof).toBe(1);
    expect(mechanism.reciprocates).toBe(false);
    expect(Math.abs(crankSwept(mechanism.joints))).toBeCloseTo(2 * Math.PI, 6);
  });

  it('carries its point around the whole ellipse, not half of it', () => {
    const { mechanism } = buildMechanism(crankedTrammelFixture(S), 'adaptive');
    let lowest = Infinity;
    let highest = -Infinity;
    for (const frame of mechanism.joints) {
      const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
      const x = at('T').x / S;
      const y = at('T').y / S;
      expect(Math.abs((x * x) / semiMajor ** 2 + (y * y) / semiMinor ** 2 - 1)).toBeLessThan(1e-6);
      expect(Math.abs(at('A').y / S)).toBeLessThan(1e-6);
      expect(Math.abs(at('B').x / S)).toBeLessThan(1e-6);
      lowest = Math.min(lowest, y);
      highest = Math.max(highest, y);
    }
    // Both halves: above the guide A rides on, and below it.
    expect(highest).toBeCloseTo(semiMinor, 3);
    expect(lowest).toBeCloseTo(-semiMinor, 3);
  });

  it('keeps running when a reader moves the crank, which a crank pinned to the middle would not', () => {
    // A crank pinned straight to the middle of the bar runs only while it is
    // exactly half the bar from the crossing; moved at all, Gruebler's zero is
    // the truth and it locks. Through the rod, moving the crank's pivot or pin
    // changes the drag-link and nothing else.
    for (const [id, dx, dy] of [
      ['O', 0.1, 0],
      ['O', 0, -0.1],
      ['C', 0.06, 0.04],
    ] as const) {
      const fixture = crankedTrammelFixture(S);
      const moved = {
        ...fixture,
        joints: fixture.joints.map((joint) =>
          joint.id === id ? { ...joint, x: joint.x + dx * S, y: joint.y + dy * S } : joint
        ),
      };
      const { mechanism } = buildMechanism(moved, 'adaptive');
      expect(mechanism.isMechanismValid(), `${id} moved`).toBe(true);
      expect(mechanism.dof, `${id} moved`).toBe(1);
      expect(mechanism.reciprocates, `${id} moved`).toBe(false);
    }
  });
});
