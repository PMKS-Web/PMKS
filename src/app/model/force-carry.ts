import { Coord } from './coord';
import { Force } from './force';

type Point = { x: number; y: number };

/**
 * Put a force where an edit carried its body, without changing the load.
 *
 * The application point goes wherever the edit sends it. Nothing else about
 * the force is the edit's to change: not its magnitude, and not the length its
 * arrow is drawn at, which a group's scale grips used to stretch along with the
 * links. Which way it points depends on its frame, as it does in the solver: a
 * Grid force keeps its bearing on the grid, and a Local force keeps its angle
 * to its own link, so it turns by however far the edit turned that link.
 *
 * @param arrow the arrow from its application point to its tip, as it was
 * before the edit.
 * @param linkTurn how far the edit turned the force's link, in radians.
 * @param direction the force's direction when `arrow` was read. An edit
 * replayed from a snapshot on every pointer move passes the snapshot's, so a
 * collapsed arrow's turn is added to where it began rather than to where the
 * last move left it.
 */
export function carryForce(
  force: Force,
  at: Point,
  arrow: Point,
  linkTurn: number,
  direction = force.angleRad
): void {
  const turn = force.local ? linkTurn : 0;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  force.moveAnchor(new Coord(at.x, at.y));
  if (Math.hypot(arrow.x, arrow.y) === 0) {
    // No arrow to read a direction off: the stored one is turned instead, and
    // the handle stays on the anchor.
    force.setCollapsedDirection(direction + turn);
    return;
  }
  force.moveDirectionHandle(
    new Coord(at.x + arrow.x * cos - arrow.y * sin, at.y + arrow.x * sin + arrow.y * cos)
  );
}

/** How far a frame turned between two placings of its two defining points. */
export function frameTurn(from: readonly [Point, Point], to: readonly [Point, Point]): number {
  const before = Math.atan2(from[1].y - from[0].y, from[1].x - from[0].x);
  const after = Math.atan2(to[1].y - to[0].y, to[1].x - to[0].x);
  const turn = after - before;
  return Math.atan2(Math.sin(turn), Math.cos(turn));
}
