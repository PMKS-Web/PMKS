/**
 * Whether a scrub handle let go here means "the start pose".
 *
 * A range input steps in thousandths, and a thousandth of a 300-pixel track is
 * a third of a pixel: dragging back to the start landed one sample short of it
 * far more often than on it, and one sample short is still mid-cycle, so the
 * editor stayed shut and asked the reader to go back to the start they could
 * see they had just reached. So the start is a seat the handle drops into from
 * a few pixels away, wherever on the track the seat is -- the left end for a
 * crank and the shared clock, part way along for an input that turns back.
 */

/** How close, on screen, counts as reaching the start. */
export const SCRUB_SNAP_PX = 6;

/**
 * The thumb's width. Its centre runs from half a thumb in to half a thumb short
 * of the end, so the track a value is spread over is the input less one thumb --
 * the same travel the stylesheet's `.anchorSeat` is laid along.
 */
export const SCRUB_THUMB_PX = 24;

/**
 * The same distance in track units (0-1000) where the track has no measured
 * width, as under jsdom: a 300-pixel track's six pixels.
 */
const UNMEASURED_SNAP = 20;

/** The handle's travel, in the units the range input counts. */
const TRACK_UNITS = 1000;

/** `inputPx` is the range input's own width; the thumb's travel is worked out here. */
export function snapsToStart(
  value: number,
  anchorAt: number | undefined,
  inputPx: number
): boolean {
  if (anchorAt === undefined || !Number.isFinite(value)) return false;
  const trackPx = inputPx - SCRUB_THUMB_PX;
  const tolerance = trackPx > 0 ? (SCRUB_SNAP_PX * TRACK_UNITS) / trackPx : UNMEASURED_SNAP;
  return Math.abs(value - anchorAt) <= tolerance;
}
