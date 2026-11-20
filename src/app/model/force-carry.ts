import { Coord } from './coord';
import { Force } from './force';

type Point = { x: number; y: number };

/**
 * How far an edit turned a force's body, read two ways.
 *
 * `solid` is the part of the turn that moved the body as one piece -- the
 * group box's rotate grip, a body dragged or turned on its own -- and every
 * force follows it, Grid or Local, the way a load bolted to a part turns when
 * the part is picked up and turned. `link` is how far the force's own link
 * turned, solid turn and reshape together; only a Local force follows that,
 * because a Grid force's bearing is the grid's and a bar bent or stretched
 * into a new angle has not turned the grid.
 */
export interface CarryTurn {
  link: number;
  solid: number;
}

/** A turn that moved the body as one piece, which both kinds of force follow. */
export const solidTurn = (angle: number): CarryTurn => ({ link: angle, solid: angle });

/** A reshape: the link turned, but nothing was turned as a solid. */
export const reshapeTurn = (linkAngle: number): CarryTurn => ({ link: linkAngle, solid: 0 });

/**
 * Put a force where an edit carried its body, without changing the load.
 *
 * The application point goes wherever the edit sends it. Nothing else about
 * the force is the edit's to change: not its magnitude, and not the length its
 * arrow is drawn at, which a group's scale grips used to stretch along with the
 * links. Which way it points is `CarryTurn`'s to say: a turn of the whole body
 * turns every force on it, and a reshape turns only a Local force, which keeps
 * its angle to its own link.
 *
 * @param arrow the arrow from its application point to its tip, as it was
 * before the edit.
 * @param direction the force's direction when `arrow` was read. An edit
 * replayed from a snapshot on every pointer move passes the snapshot's, so a
 * collapsed arrow's turn is added to where it began rather than to where the
 * last move left it.
 */
export function carryForce(
  force: Force,
  at: Point,
  arrow: Point,
  turned: CarryTurn,
  direction = force.angleRad
): void {
  const turn = force.local ? turned.link : turned.solid;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  force.moveAnchor(new Coord(at.x, at.y));
  if (Math.hypot(arrow.x, arrow.y) === 0) {
    // No arrow to read a direction off: the stored one is turned instead, and
    // the handle stays on the anchor -- put back on it exactly, because
    // `moveAnchor` adds the move to the tip and can leave it a rounding error
    // away, and an arrow of 2e-16 is one `setCollapsedDirection` will not turn.
    force.moveDirectionHandle(new Coord(at.x, at.y));
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
