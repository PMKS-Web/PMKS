import {
  bodyLabelAngle,
  bodyLabelCenter,
  jointLabelOffset,
  placeBarLabel,
  uprightAngle,
} from './label-placement';
import { PrisJoint, RevJoint } from './joint';
import { RealLink } from './link';

describe('label clearance', () => {
  it('does not flip a name when two connected spokes pass each other', () => {
    const joint = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, 0);
    const c = new RevJoint('C', 1, 0.01);
    joint.connectedJoints = [b, c];
    const reference = [
      new RevJoint('A', 0, 0),
      new RevJoint('B', 1, 0),
      new RevJoint('C', 1, 0.01),
    ];
    const before = jointLabelOffset(joint, 0.2, 1, reference);
    c.y = -0.01;
    const after = jointLabelOffset(joint, 0.2, 1, reference);
    expect(before.x).toBeLessThan(0);
    expect(after.x).toBeLessThan(0);
    expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(0.02);
  });
  it('clears the full slider block instead of treating it as a small round pin', () => {
    const joint = new PrisJoint('C', 0, 0);
    const offset = jointLabelOffset(joint, 0.2, 1);
    expect(Math.hypot(offset.x, offset.y)).toBeGreaterThan(0.7);
  });
  it('puts a long name beside a short bar instead of pushing it through the end pin', () => {
    const link = new RealLink('AB', [new RevJoint('A', -1, 0), new RevJoint('B', 1, 0)]);
    const placed = placeBarLabel(
      link,
      { x: 0, y: 0 },
      'Luffing link',
      0,
      { x: 1, y: 0 },
      0.3,
      1,
      true
    );
    expect(placed.outside).toBe(true);
    expect(placed.x).toBe(0);
    expect(placed.y - 0.3 * 0.55).toBeGreaterThan(0.15);
  });

  it('keeps a joint label in its authored open sector while its neighbors move', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 1, -0.01);
    const c = new RevJoint('C', -1, -0.01);
    a.connectedJoints = [b, c];
    const reference = [
      new RevJoint('A', 0, 0),
      new RevJoint('B', 1, -0.01),
      new RevJoint('C', -1, -0.01),
    ];
    const before = jointLabelOffset(a, 0.2, 1, reference);
    b.y = c.y = 0.01;
    const after = jointLabelOffset(a, 0.2, 1, reference);
    expect(before.y).toBeGreaterThan(0.15);
    expect(after.y).toBeGreaterThan(0.15);
    expect(Math.hypot(before.x - after.x, before.y - after.y)).toBeLessThan(0.02);
  });

  it('keeps collinear wheel-point labels outside the spokes throughout a revolution', () => {
    const joint = new RevJoint('I', 0, 0);
    const center = new RevJoint('G', 1, 0);
    const pin = new RevJoint('H', 1.7, 0);
    joint.connectedJoints = [center, pin];
    const reference = [new RevJoint('I', 0, 0), new RevJoint('G', 1, 0), new RevJoint('H', 1.7, 0)];
    let previous = jointLabelOffset(joint, 0.2, 1, reference);
    for (let degree = 0; degree <= 360; degree++) {
      const angle = (degree * Math.PI) / 180;
      center.x = Math.cos(angle);
      center.y = Math.sin(angle);
      pin.x = 1.7 * Math.cos(angle);
      pin.y = 1.7 * Math.sin(angle) + (degree % 2 ? 1e-12 : -1e-12);
      const next = jointLabelOffset(joint, 0.2, 1, reference);
      expect(next.x * center.x + next.y * center.y).toBeLessThan(0);
      expect(Math.hypot(next.x - previous.x, next.y - previous.y)).toBeLessThan(0.02);
      previous = next;
    }
  });

  it('writes a long compound ID along the narrow constituent it names', () => {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 0, 10);
    const c = new RevJoint('C', 0.1, 6);
    const part = new RealLink('ABC', [a, b, c]);
    const body = new RealLink('ABCDEFGHIJK', [a, b, c], 0, 0, undefined, [part]);
    expect(Math.abs(bodyLabelAngle(body, body.id, 0.2, 1))).toBe(90);
    expect(bodyLabelCenter(body, body.id, 0.2, 1).y).toBe(3);
    a.x = 0.01;
    b.x = -0.01;
    expect(Math.abs(bodyLabelAngle(body, body.id, 0.2, 1))).toBeGreaterThan(89);
  });
  it('reads a steep name bottom to top, a few degrees either side of vertical', () => {
    const turned = { '-90': -90, '90': -90, '85': -95, '-95': -95, '79': 79, '0': 0, '100': -80 };
    for (const [degrees, upright] of Object.entries(turned))
      expect(uprightAngle(+degrees)).toBeCloseTo(upright, 9);
    const bar = (dx: number) =>
      new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', dx, 20)]);
    expect(bodyLabelAngle(bar(1), 'AB', 1, 1)).toBeLessThan(-80);
    expect(bodyLabelAngle(bar(-1), 'AB', 1, 1)).toBeLessThan(-80);
  });
  it('runs every bar name along its bar, however short the name', () => {
    const bar = new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', 0, 50)]);
    expect(bodyLabelAngle(bar, 'AB', 1, 100)).toBe(-90);
    expect(bodyLabelAngle(bar, 'AB', 1, 0.01)).toBe(-90);
  });
});
