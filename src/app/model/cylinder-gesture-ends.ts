import { Coord } from './coord';
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
 */
export function cylinderGestureEnds(
  start: CylinderGestureEnd,
  end: CylinderGestureEnd
): { base: CylinderGestureEnd; rodEnd: CylinderGestureEnd } {
  const startsOnPart = start.joint !== undefined || start.link !== undefined;
  return startsOnPart ? { base: end, rodEnd: start } : { base: start, rodEnd: end };
}
