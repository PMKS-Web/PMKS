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
  // A at (2,0), B at (0,2): twice the driven trammel.
  const bar = 2 * L;

  /** How far a joint turned about a center over the whole cycle, in radians. */
  const swept = (frames: Joint[][], id: string, center: (frame: Joint[]) => Joint | null) => {
    const angle = (frame: Joint[]) => {
      const about = center(frame);
      const at = frame.find((joint) => joint.id === id)!;
      return Math.atan2(at.y - (about?.y ?? 0), at.x - (about?.x ?? 0));
    };
    let total = 0;
    for (let step = 1; step < frames.length; step++) {
      let increment = angle(frames[step]) - angle(frames[step - 1]);
      while (increment > Math.PI) increment -= 2 * Math.PI;
      while (increment < -Math.PI) increment += 2 * Math.PI;
      total += increment;
    }
    return total;
  };
  const pivot = (frame: Joint[]) => frame.find((joint) => joint.id === 'O')!;
  const crossing = () => null;

  it('turns the crank and the bar all the way round, and loops', () => {
    const { mechanism } = buildMechanism(crankedTrammelFixture(S), 'adaptive');
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(mechanism.dof).toBe(1);
    expect(mechanism.reciprocates).toBe(false);
    expect(Math.abs(swept(mechanism.joints, 'C', pivot))).toBeCloseTo(2 * Math.PI, 6);
    // The middle of the bar, about the crossing: one turn of it is one turn of the bar.
    expect(Math.abs(swept(mechanism.joints, 'M', crossing))).toBeCloseTo(2 * Math.PI, 6);
  });

  it('carries its point around the whole ellipse, not half of it', () => {
    const fixture = crankedTrammelFixture(S);
    const { mechanism } = buildMechanism(fixture, 'adaptive');
    // Where P sits on the bar, read once off the drawing: ‘along’ from A
    // towards B and ‘aside’ square to it. With the ends at A = (L cos t, 0)
    // and B = (0, L sin t), that puts P at
    //   x = (L - along) cos t + aside sin t,  y = aside cos t + along sin t,
    // an ellipse about the crossing fixed by the drawing alone. Each frame's P
    // is checked against it, not against a point rebuilt from that frame's ends.
    const drawn = (id: string) => fixture.joints.find((joint) => joint.id === id)!;
    const [a, p] = [drawn('A'), drawn('P')];
    const angle = Math.atan2(drawn('B').y, a.x);
    const along = (p.x - a.x) * -Math.cos(angle) + (p.y - a.y) * Math.sin(angle);
    const aside = (p.x - a.x) * Math.sin(angle) + (p.y - a.y) * Math.cos(angle);
    // The inverse of [[bar - along, aside], [aside, along]] takes P back to
    // (cos t, sin t), which is on the unit circle exactly when P is on its ellipse.
    const [m11, m12, m21, m22] = [bar - along / S, aside / S, aside / S, along / S];
    const det = m11 * m22 - m12 * m21;
    for (const frame of mechanism.joints) {
      const at = (id: string): Joint => frame.find((joint) => joint.id === id)!;
      // The trammel itself: each end on its own guide, the bar its own length.
      expect(Math.abs(at('A').y / S)).toBeLessThan(1e-6);
      expect(Math.abs(at('B').x / S)).toBeLessThan(1e-6);
      expect(Math.hypot(at('A').x - at('B').x, at('A').y - at('B').y) / S).toBeCloseTo(bar, 4);
      // The traced point itself, where the solver put it.
      const x = at('P').x / S;
      const y = at('P').y / S;
      const cos = (m22 * x - m12 * y) / det;
      const sin = (m11 * y - m21 * x) / det;
      expect(Math.abs(Math.hypot(cos, sin) - 1)).toBeLessThan(1e-6);
    }
    // The traced point goes once round the crossing: the whole curve, where a
    // driven block covers half of it, out and back.
    expect(Math.abs(swept(mechanism.joints, 'P', crossing))).toBeCloseTo(2 * Math.PI, 6);
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
