import { Coord } from './coord';
import { cylinderCreationLayout } from './cylinder';
import { RealJoint } from './joint';
import { RealLink } from './link';

/** One end of the two-point Add Cylinder gesture, and the part it landed on, if any. */
export interface CylinderGestureEnd {
  at: Coord;
  joint?: RealJoint;
  link?: RealLink;
}

/**
 * Which end of the gesture gets the barrel, the cylinder's thick base (#366).
 *
 * Drawn from empty grid, the base is where the gesture started. Started on a
 * joint or a link, the base is where it ended and the rod reaches back to the
 * part the gesture started from, so the ram pushes on what was clicked first.
 * The preview and the click both ask this, so the ghost shows the part the
 * click builds.
 *
 * `rodHeld` says the rod's end is on a part: the cylinder is built to reach
 * it exactly. A gesture shorter than the smallest cylinder is lengthened at
 * the base rather than past the part, which a free base allows; a base on a
 * joint stays on it.
 */
export function cylinderGestureEnds(
  start: CylinderGestureEnd,
  end: CylinderGestureEnd,
  cylinderScale: number
): { base: CylinderGestureEnd; rodEnd: CylinderGestureEnd; rodHeld: boolean } {
  const startsOnPart = start.joint !== undefined || start.link !== undefined;
  if (!startsOnPart) return { base: start, rodEnd: end, rodHeld: false };
  // A ram from a joint back to itself is not a ram: the end is free grid.
  const base = end.joint === start.joint ? { at: end.at } : end;
  if (base.joint) return { base, rodEnd: start, rodHeld: true };
  const layout = cylinderCreationLayout(base.at, start.at, cylinderScale);
  const drawn = Math.hypot(start.at.x - base.at.x, start.at.y - base.at.y);
  if (layout.span <= drawn) return { base, rodEnd: start, rodHeld: true };
  const at = new Coord(
    base.at.x + start.at.x - layout.mountB.x,
    base.at.y + start.at.y - layout.mountB.y
  );
  return { base: { ...base, at }, rodEnd: start, rodHeld: true };
}
