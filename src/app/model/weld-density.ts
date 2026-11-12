import { convexHull } from './uniform-body';

/**
 * One density for a whole compound: how its single mass is shared among the
 * links welded into it.
 *
 * A compound used to keep a mass per member, typed or left at zero, and its
 * center of mass was the members' centers weighted by those numbers. Weld a
 * 10 g bar to a 0 g one and the center sat on the heavy bar however long the
 * light one grew (Alex's L on #279). A compound is one rigid part now, so it
 * has one mass, spread evenly through its material.
 *
 * "Material" has to be one measure for bars and plates alike, and the solver
 * idealizes a bar as a line and a plate as an area -- two things that cannot
 * be added without a width. A bar's drawn width comes from Object Size, which
 * is set by the zoom when the first part was drawn, so using it would let two
 * students drawing the same part get different physics. So every member is
 * measured by length: a bar by its own, a plate by its outline, a disc by its
 * rim. Exact for a weld of bars, which is the common case, and the same for
 * every reader of the same drawing.
 */

type Point = { x: number; y: number };

const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * How much material one link is, measured by length (see above): a disc by
 * its rim about `discCenter`, a plate by its outline, a bar by its own length.
 */
export function materialOfShape(joints: readonly Point[], discCenter?: Point): number {
  if (discCenter !== undefined) {
    const reach = joints.reduce((far, joint) => Math.max(far, distance(discCenter, joint)), 0);
    return 2 * Math.PI * reach;
  }
  const points = distinct(joints);
  if (points.length >= 3) {
    const hull = convexHull(points);
    if (hull.length >= 3 && !collinear(hull)) return perimeter(hull);
  }
  return longestSpan(points);
}

/**
 * Each member's share of the compound's mass, from the members' materials.
 *
 * Members that are all points have no length to share by, and split evenly
 * rather than dividing by zero.
 */
export function sharesOf(materials: readonly number[]): number[] {
  const total = materials.reduce((sum, material) => sum + material, 0);
  if (!(total > 0)) return materials.map(() => 1 / Math.max(1, materials.length));
  return materials.map((material) => material / total);
}

function distinct(points: readonly Point[]) {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x},${point.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function longestSpan(points: readonly { x: number; y: number }[]): number {
  let longest = 0;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      longest = Math.max(longest, distance(points[i], points[j]));
    }
  }
  return longest;
}

function perimeter(hull: readonly { x: number; y: number }[]): number {
  return hull.reduce((sum, point, i) => sum + distance(point, hull[(i + 1) % hull.length]), 0);
}

/** A hull with next to no area for its size is a bar with a tracer on its axis. */
function collinear(hull: readonly { x: number; y: number }[]): boolean {
  let area2 = 0;
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i];
    const q = hull[(i + 1) % hull.length];
    area2 += p.x * q.y - q.x * p.y;
  }
  const span = longestSpan(hull);
  return Math.abs(area2) < 1e-9 * Math.max(span * span, 1);
}
