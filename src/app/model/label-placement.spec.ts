import {
  bodyLabelAngle,
  bodyLabelCenter,
  jointLabelOffset,
  placeBarLabel,
} from './label-placement';
import { RevJoint } from './joint';
import { RealLink } from './link';

describe('label clearance', () => {
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
});
