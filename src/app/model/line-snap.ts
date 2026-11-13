/**
 * Pulling a tracer point onto the line of the bar it rides when it is nearly
 * there.
 *
 * The axis snap squares a joint against another joint's x or y, which puts a
 * tracer exactly on a horizontal or vertical bar and nowhere else: on a
 * slanted bar it almost never lands on the line, and the bar becomes a
 * three-joint plate unless the reader types coordinates. This is the same help
 * for any slant -- the line through two of the body's own joints -- with the
 * same screen-distance tolerance and the same dotted guide.
 *
 * Once on the line, it still squares against a neighbor's axis where the two
 * cross nearby, so "on the bar, level with the pivot" is one gesture.
 */
import { AxisSnapResult, SnapGuide, SnapPoint } from './axis-snap';

/** A line through two of the body's own joints. */
export interface SnapLine {
  from: SnapPoint;
  to: SnapPoint;
}

/** Every line through two of `points`, for a body with more than two joints. */
export function linesThrough(points: SnapPoint[]): SnapLine[] {
  const lines: SnapLine[] = [];
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (Math.hypot(points[j].x - points[i].x, points[j].y - points[i].y) > 0) {
        lines.push({ from: points[i], to: points[j] });
      }
    }
  }
  return lines;
}

/**
 * Where `wanted` lands if it is within `tolerance` of one of `lines`, or
 * nothing when it is not near any of them.
 *
 * `others` are the joints whose axes may then square the point up along that
 * line; pass none to place on the line alone.
 */
export function snapToLines(
  wanted: SnapPoint,
  lines: SnapLine[],
  others: SnapPoint[],
  tolerance: number
): AxisSnapResult | undefined {
  let best: { line: SnapLine; point: SnapPoint } | undefined;
  let bestDistance = tolerance;
  for (const line of lines) {
    const point = projectOnto(wanted, line);
    const distance = Math.hypot(point.x - wanted.x, point.y - wanted.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { line, point };
    }
  }
  if (!best) return undefined;

  const squared = squareAlong(best.line, best.point, others, tolerance);
  const point = squared?.point ?? best.point;
  const guides: SnapGuide[] = [spanOf(best.line, point)];
  if (squared) {
    guides.push({ x1: point.x, y1: point.y, x2: squared.by.x, y2: squared.by.y });
  }
  return { point, guides };
}

/** The foot of the perpendicular from `point` to the infinite line. */
function projectOnto(point: SnapPoint, line: SnapLine): SnapPoint {
  const dx = line.to.x - line.from.x;
  const dy = line.to.y - line.from.y;
  const t = ((point.x - line.from.x) * dx + (point.y - line.from.y) * dy) / (dx * dx + dy * dy);
  return { x: line.from.x + t * dx, y: line.from.y + t * dy };
}

/**
 * The nearest place along the line that is also level with, or plumb under, a
 * neighbor -- if one is within tolerance of where the point already is.
 */
function squareAlong(
  line: SnapLine,
  at: SnapPoint,
  others: SnapPoint[],
  tolerance: number
): { point: SnapPoint; by: SnapPoint } | undefined {
  const dx = line.to.x - line.from.x;
  const dy = line.to.y - line.from.y;
  let best: { point: SnapPoint; by: SnapPoint } | undefined;
  let bestDistance = tolerance;
  const consider = (point: SnapPoint, by: SnapPoint) => {
    const distance = Math.hypot(point.x - at.x, point.y - at.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { point, by };
    }
  };
  for (const other of others) {
    // A line parallel to an axis never crosses it once; it is the axis.
    if (dx !== 0) {
      const t = (other.x - line.from.x) / dx;
      consider({ x: other.x, y: line.from.y + t * dy }, other);
    }
    if (dy !== 0) {
      const t = (other.y - line.from.y) / dy;
      consider({ x: line.from.x + t * dx, y: other.y }, other);
    }
  }
  return best;
}

/**
 * The guide: the stretch of the line covering both of its joints and the
 * snapped point, so the reader sees the whole bar the point was put in line
 * with, including when it lands beyond either end.
 */
function spanOf(line: SnapLine, point: SnapPoint): SnapGuide {
  const dx = line.to.x - line.from.x;
  const dy = line.to.y - line.from.y;
  const along = (p: SnapPoint) =>
    ((p.x - line.from.x) * dx + (p.y - line.from.y) * dy) / (dx * dx + dy * dy);
  const ts = [0, 1, along(point)];
  const lo = Math.min(...ts);
  const hi = Math.max(...ts);
  return {
    x1: line.from.x + lo * dx,
    y1: line.from.y + lo * dy,
    x2: line.from.x + hi * dx,
    y2: line.from.y + hi * dy,
  };
}
