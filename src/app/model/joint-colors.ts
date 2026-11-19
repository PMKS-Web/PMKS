/**
 * The colors a part can be drawn in.
 *
 * A leaf module with no imports of its own, like the object scale beside it:
 * the URL codec and the canvas both need these, and neither should be reaching
 * through the service graph for a list of hex values.
 */

/**
 * What links are drawn in, and what forces are offered.
 *
 * One palette for both, because a force belongs to a link and reading a drawing
 * means pairing them up -- a force in a color no link could be would say it
 * belonged to something that is not there.
 */
export const PART_COLORS = [
  '#c5cae9',
  '#303e9f',
  '#0d125a',
  '#B2DFDB',
  '#26A69A',
  '#00695C',
] as const;

/**
 * What a stored part color is painted as.
 *
 * Every name on the canvas is black, so the two navies are drawn a step
 * lighter than the value on file: at the darkest, a black name on the 70%
 * fill read at about 3:1. The stored hex is what every URL already carries
 * and what the picker matches on, so it does not change; only the paint does.
 * The indigo ramp keeps three distinct steps (100, 400, 600), and black reads
 * on each at better than 5:1.
 */
const PAINTED_AS: Readonly<Record<string, string>> = {
  '#303e9f': '#5c6bc0',
  '#0d125a': '#3949ab',
};

/** The color a stored part color is drawn in on the canvas and in the picker. */
export function paintOf(color: string): string;
export function paintOf(color: string | undefined): string | undefined;
export function paintOf(color: string | undefined): string | undefined {
  return color === undefined ? undefined : (PAINTED_AS[color.toLowerCase()] ?? color);
}

/**
 * The color a force is drawn in until somebody chooses another.
 *
 * The darkest of the six rather than a seventh color of its own, so the picker
 * always has one swatch ticked and there is nothing in the list that is not
 * also a link color.
 */
export const DEFAULT_FORCE_COLOR = '#0d125a';

/**
 * One joint color: what it is drawn in at rest, under the cursor, and picked.
 *
 * `id` is what travels in the URL, and the first family's is empty -- a joint
 * that has never been given a color says nothing, so a drawing where nobody
 * chose one encodes to the bytes it always did.
 */
export interface JointFamily {
  id: string;
  name: string;
  normal: string;
  hover: string;
  selected: string;
}

/**
 * Amber through brown, warm the whole way, none of it a link color.
 *
 * Amber is exactly what every joint has always been drawn in and does not move.
 * The other three sit a step further up their own ramps than amber does on
 * hers -- at the palest they were four off-whites a hand's width apart, which
 * read as one material but left a colored joint indistinguishable from an
 * uncolored one until somebody pointed at it. The hover shade moves with the
 * resting one, or the two would be the same color.
 */
export const JOINT_FAMILIES: readonly JointFamily[] = [
  { id: '', name: 'Amber', normal: '#fff8e1', hover: '#ffecb3', selected: '#ffca28' },
  { id: 'o', name: 'Orange', normal: '#ffe0b2', hover: '#ffcc80', selected: '#fb8c00' },
  { id: 'd', name: 'Deep orange', normal: '#ffccbc', hover: '#ffab91', selected: '#f4511e' },
  { id: 'b', name: 'Brown', normal: '#d7ccc8', hover: '#bcaaa4', selected: '#6d4c41' },
];

/**
 * What a selection looks like whichever family a joint is drawn in.
 *
 * Amber is what "picked" means everywhere in the app -- the outline of a
 * selected link, every pressed control -- so a joint in another family wears it
 * as a ring inside its own edge rather than giving up its own color. The fill
 * says which joint this is; the ring says it is the one that is selected.
 */
export const SELECTION_RING = '#ffca28';
