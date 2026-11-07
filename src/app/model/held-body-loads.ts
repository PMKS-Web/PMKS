import { Coord } from './coord';
import { Force } from './force';
import { Link, RealLink } from './link';

type Point = { x: number; y: number };

/** Capture loads before per-joint hold writes, which can temporarily move binary-link loads. */
export function heldBodyLoads(root: Link): () => void {
  const bodies = [root, ...(root instanceof RealLink ? root.subset : [])].map((link) => ({
    link,
    joints: link.joints.map(({ x, y }) => ({ x, y })),
    forces: link.forces.map((force) => ({
      force,
      start: { x: force.startCoord.x, y: force.startCoord.y },
      end: { x: force.endCoord.x, y: force.endCoord.y },
    })),
  }));
  return () => {
    const handled = new Set<Force>();
    for (const { link, joints, forces } of bodies) {
      const map = rigidMap(joints, link.joints);
      if (!map) continue;
      for (const { force, start, end } of forces) {
        if (handled.has(force)) continue;
        handled.add(force);
        force.moveAnchor(map(start));
        force.moveDirectionHandle(map(end));
      }
    }
  };
}

/** Fit a rotation and translation, accepting it only when every joint follows without strain. */
function rigidMap(from: Point[], to: Point[]): ((point: Point) => Coord) | undefined {
  const a = from[0];
  const b = from.find((point) => Math.hypot(point.x - a.x, point.y - a.y) > 1e-6);
  if (!a || !b) return undefined;
  const at = from.indexOf(b);
  const turn =
    Math.atan2(to[at].y - to[0].y, to[at].x - to[0].x) - Math.atan2(b.y - a.y, b.x - a.x);
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const map = (point: Point) =>
    new Coord(
      to[0].x + cos * (point.x - a.x) - sin * (point.y - a.y),
      to[0].y + sin * (point.x - a.x) + cos * (point.y - a.y)
    );
  // Hold writes round to six decimal places. Allow that noise, never a changed shape.
  return from.every((point, index) => {
    const mapped = map(point);
    return Math.hypot(mapped.x - to[index].x, mapped.y - to[index].y) < 1e-5;
  })
    ? map
    : undefined;
}
