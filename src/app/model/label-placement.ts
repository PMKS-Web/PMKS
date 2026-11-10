import { Joint, PrisJoint, RealJoint } from './joint';
import { Link, RealLink } from './link';

type Point = { x: number; y: number };
const turn = 2 * Math.PI;
const positive = (angle: number) => ((angle % turn) + turn) % turn;

/** Choose an open sector at the authored pose and follow it as the joint moves. */
export function jointLabelOffset(
  joint: Joint,
  fontSize: number,
  scale: number,
  reference: readonly Joint[] = []
): Point {
  const neighbors = joint instanceof RealJoint ? joint.connectedJoints : [];
  const origin = reference.find((one) => one.id === joint.id) ?? joint;
  const bearing = (from: Point, to: Point) => Math.atan2(to.y - from.y, to.x - from.x);
  const directions = neighbors
    .filter((one) => Math.hypot(one.x - joint.x, one.y - joint.y) > 1e-9)
    .map((one) => ({
      start: positive(bearing(origin, reference.find((ref) => ref.id === one.id) ?? one)),
      now: bearing(joint, one),
    }));
  // The ground symbol occupies the sector below the pin even without a bar there.
  if (joint instanceof RealJoint && joint.ground) {
    directions.push({ start: 1.5 * Math.PI, now: -Math.PI / 2 });
  }
  directions.sort((a, b) => a.start - b.start);
  let angle = (3 * Math.PI) / 4;
  let widest = -1;
  directions.forEach((from, i) => {
    const to = directions[(i + 1) % directions.length];
    // Sorted equal bearings leave one full outside sector, not two zero gaps.
    const gap = to.start + (i === directions.length - 1 ? turn : 0) - from.start;
    if (gap > widest + 1e-9) {
      widest = gap;
      // Keep the authored clearance relative to this body. Re-bisecting a
      // live sector flips the name half a turn when two spokes cross, even
      // though the pin itself moved smoothly. Some overlap is preferable to
      // labels jumping between sectors during playback.
      angle = from.now + gap / 2;
    }
  });
  const x = Math.cos(angle);
  const y = Math.sin(angle);
  const halfWidth = joint.name.length * fontSize * 0.34;
  const halfHeight = fontSize * 0.55;
  const radius =
    scale *
    (joint instanceof PrisJoint ? 0.62 : joint instanceof RealJoint && joint.input ? 0.4 : 0.15);
  const distance = radius + fontSize * 0.35 + Math.abs(x) * halfWidth + Math.abs(y) * halfHeight;
  return { x: x * distance, y: y * distance };
}

/** A long name must not be pushed past a pin just to make room for a CoM mark. */
export function placeBarLabel(
  link: Link,
  center: Point,
  name: string,
  angle: number,
  axis: Point,
  fontSize: number,
  scale: number,
  occupiedCenter: boolean
): Point & { outside: boolean } {
  const [a, b] = link.joints;
  const halfSpan = Math.hypot(b.x - a.x, b.y - a.y) / 2;
  const halfWidth = name.length * fontSize * 0.34;
  const halfHeight = fontSize * 0.55;
  const extent =
    angle !== 0 ? halfWidth : Math.abs(axis.x) * halfWidth + Math.abs(axis.y) * halfHeight;
  const clearance = 0.22 * scale;
  const along = occupiedCenter ? clearance + extent : 0;
  if (along + extent + 0.2 * scale <= halfSpan) {
    return { x: center.x + axis.x * along, y: center.y + axis.y * along, outside: false };
  }
  // The normal follows the same authored end as the on-bar name, so playback
  // cannot flip the label to the other side at a horizontal crossing.
  const across =
    angle !== 0 ? halfHeight : Math.abs(axis.y) * halfWidth + Math.abs(axis.x) * halfHeight;
  const off = 0.22 * scale + across;
  return { x: center.x - axis.y * off, y: center.y + axis.x * off, outside: true };
}

function longestSpan(link: Link): { from: Joint; to: Joint; length: number } | undefined {
  let best: { from: Joint; to: Joint; length: number } | undefined;
  link.joints.forEach((from, i) => {
    for (const to of link.joints.slice(i + 1)) {
      const length = Math.hypot(to.x - from.x, to.y - from.y);
      if (!best || length > best.length + 1e-6) best = { from, to, length };
    }
  });
  return best;
}

/** A welded body's name belongs to its longest constituent, not the empty crook. */
export function labelBody(link: Link): Link {
  const parts = link instanceof RealLink ? link.subset : [];
  if (!parts?.length) return link;
  return parts
    .map(labelBody)
    .reduce((best, part) =>
      (longestSpan(part)?.length ?? 0) > (longestSpan(best)?.length ?? 0) + 1e-6 ? part : best
    );
}

/** The span a name follows when it cannot fit across a slender member. */
function labelSpan(link: Link, name: string, fontSize: number, scale: number) {
  const on = labelBody(link);
  const span = longestSpan(on);
  if (!span || span.length < 1e-9 || (on instanceof RealLink && on.isCircle)) return undefined;
  // A bar's name always runs along the bar, in every style. Whether it turned
  // used to depend on whether two letters fit across the bar, which is a
  // question of the style's width: the same name lay flat in Standard and
  // stood up in Fine.
  if (link.joints.length !== 2) {
    if (name.length <= 2) return undefined;
    const normal = {
      x: -(span.to.y - span.from.y) / span.length,
      y: (span.to.x - span.from.x) / span.length,
    };
    const across = on.joints.map(
      (j) => (j.x - span.from.x) * normal.x + (j.y - span.from.y) * normal.y
    );
    const width = Math.max(...across) - Math.min(...across) + 0.3 * scale;
    if (span.length < 3 * width || name.length * fontSize * 0.68 <= width) return undefined;
  }
  return span;
}

/** A long compound ID follows the narrow member instead of spilling across its edges. */
export function bodyLabelTurns(link: Link, name: string, fontSize: number, scale: number): boolean {
  return !!labelSpan(link, name, fontSize, scale);
}

export function bodyLabelAngle(link: Link, name: string, fontSize: number, scale: number): number {
  const span = labelSpan(link, name, fontSize, scale);
  if (!span) return 0;
  const angle = (-Math.atan2(span.to.y - span.from.y, span.to.x - span.from.x) * 180) / Math.PI;
  return Math.round(uprightAngle(angle) * 10) / 10;
}

/**
 * A text rotation, in screen degrees (clockwise positive), turned to read the
 * right way up: within [-100, 80). A steep name therefore always reads bottom
 * to top -- the drafting convention -- including a bar a few degrees past
 * vertical, which split names on one drawing into two reading directions when
 * the cut was exactly at 90.
 */
export function uprightAngle(degrees: number): number {
  return ((((degrees + 100) % 180) + 180) % 180) - 100;
}

/**
 * How long a name may be on this body before it no longer fits between the
 * pins: the longest span, less a pin's clearance at each end. Nothing for a
 * disc, whose name sits at its center with room to spare.
 */
export function labelRoom(link: Link, scale: number): number | undefined {
  const on = labelBody(link);
  if (on instanceof RealLink && on.isCircle) return undefined;
  const span = longestSpan(on);
  if (!span || span.length < 1e-9) return undefined;
  return Math.max(0, span.length - 0.8 * scale);
}

/** Prefer the longest clear interval to keep intermediate pins out of the name. */
export function bodyLabelCenter(link: Link, name: string, fontSize: number, scale: number): Point {
  const joints = labelBody(link).joints;
  const span = labelSpan(link, name, fontSize, scale);
  if (span && link.joints.length > 2 && joints.length > 2) {
    const along = (joint: Joint) =>
      (joint.x - span.from.x) * (span.to.x - span.from.x) +
      (joint.y - span.from.y) * (span.to.y - span.from.y);
    const ordered = [...joints].sort((a, b) => along(a) - along(b));
    let start = ordered[0],
      end = ordered[1];
    for (let i = 1; i < ordered.length - 1; i++) {
      if (along(ordered[i + 1]) - along(ordered[i]) > along(end) - along(start) + 1e-6) {
        start = ordered[i];
        end = ordered[i + 1];
      }
    }
    return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
  }
  return {
    x: joints.reduce((sum, joint) => sum + joint.x, 0) / (joints.length || 1),
    y: joints.reduce((sum, joint) => sum + joint.y, 0) / (joints.length || 1),
  };
}
