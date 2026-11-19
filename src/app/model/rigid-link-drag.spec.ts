import { HoldBar, HoldJoint, settleHolds } from './hold-solver';
import { linkDragGoals, rigidBodyHolds, rigidDragMap } from './rigid-link-drag';

// A pin between two fixed distances is immovable; the body hanging from it
// still has one rotation. These are geometric constraints, not a joint Lock.
describe('a rigid body carried beside fixed dimensions', () => {
  const joints: HoldJoint[] = [
    { id: 'A', x: -3, y: 0, fixed: true },
    { id: 'B', x: 0, y: 4, fixed: false },
    { id: 'C', x: 3, y: 0, fixed: true },
    { id: 'E', x: 4, y: 5, fixed: false },
  ];
  const anchors: HoldBar[] = ['A', 'C'].map((id) => ({
    id: id + 'B',
    a: id,
    b: 'B',
    hold: 'length',
    length: 5,
    angle: Math.atan2(4, -joints.find((joint) => joint.id === id)!.x),
  }));
  const body = joints.filter((joint) => ['B', 'E'].includes(joint.id));

  it('swings about an endpoint immobilized by neighboring holds', () => {
    const goals = linkDragGoals(body, { x: 2, y: 6 });
    const solved = settleHolds(joints, [...anchors, ...rigidBodyHolds(body)], goals);
    expect(solved.satisfied).toBe(true);
    expect(solved.immovable).toEqual(['B']);
    expect(solved.positions.has('B')).toBe(false);
    const end = solved.positions.get('E')!;
    expect(Math.hypot(end.x, end.y - 4)).toBeCloseTo(Math.sqrt(17), 6);
    expect(Math.hypot(end.x - 4, end.y - 5)).toBeGreaterThan(0.1);
  });

  it('leaves a body with both endpoints fixed entirely still', () => {
    const fixed = joints.map((joint) => ({ ...joint, fixed: true }));
    const solved = settleHolds(
      fixed,
      [...anchors, ...rigidBodyHolds(body)],
      linkDragGoals(body, { x: 2, y: 6 })
    );
    expect(solved.satisfied).toBe(true);
    expect(solved.positions.size).toBe(0);
  });
});

it('refuses a mirrored body even though all pairwise distances are the same', () => {
  const body = [
    { id: 'A', x: 0, y: 0 },
    { id: 'B', x: 3, y: 0 },
    { id: 'C', x: 1, y: 2 },
  ];
  const mirrored = new Map(body.map((p) => [p.id, { x: p.x, y: -p.y }]));
  expect(rigidDragMap(body, mirrored)).toBeUndefined();
});
