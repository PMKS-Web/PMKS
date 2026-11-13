import { HoldBar, HoldGoal } from './hold-solver';

/** Absolute targets from the grab's shape, rather than the last constrained pose. */
export function linkDragGoals(
  points: readonly HoldGoal[],
  target: { x: number; y: number }
): HoldGoal[] {
  const first = points[0];
  return points.map((point) => ({
    id: point.id,
    x: point.x + target.x - first.x,
    y: point.y + target.y - first.y,
  }));
}

/** Temporary dimensions: a body drag keeps every separation, including across welded leaves. */
export function rigidBodyHolds(points: readonly HoldGoal[]): HoldBar[] {
  return points.flatMap((a, index) =>
    points.slice(index + 1).map((b) => ({
      id: `drag:${a.id}:${b.id}`,
      a: a.id,
      b: b.id,
      hold: 'length' as const,
      length: Math.hypot(b.x - a.x, b.y - a.y),
      angle: Math.atan2(b.y - a.y, b.x - a.x),
    }))
  );
}

/** Carry the body's loads and hand-placed center through the solved rotation and translation. */
export function rigidDragMap(
  points: readonly HoldGoal[],
  positions: ReadonlyMap<string, { x: number; y: number }>
): ((x: number, y: number) => { x: number; y: number }) | undefined {
  const a = points[0];
  const b = points.reduce((far, point) =>
    Math.hypot(point.x - a.x, point.y - a.y) > Math.hypot(far.x - a.x, far.y - a.y) ? point : far
  );
  const toA = positions.get(a.id) ?? a;
  const toB = positions.get(b.id) ?? b;
  const angle = Math.atan2(toB.y - toA.y, toB.x - toA.x) - Math.atan2(b.y - a.y, b.x - a.x);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const mapPoint = (x: number, y: number) => ({
    x: toA.x + (x - a.x) * cos - (y - a.y) * sin,
    y: toA.y + (x - a.x) * sin + (y - a.y) * cos,
  });
  // Distances alone also admit a mirror image. A carried body cannot flip
  // over, even if a distant target made that branch easier for projection.
  const fits = points.every((point) => {
    const wanted = positions.get(point.id) ?? point;
    const at = mapPoint(point.x, point.y);
    return Math.hypot(at.x - wanted.x, at.y - wanted.y) < 1e-5;
  });
  return fits ? mapPoint : undefined;
}
