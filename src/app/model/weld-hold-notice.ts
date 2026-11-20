import { RealLink, heldValues } from './link';
import { holdOf } from './link-holds';

/**
 * What a weld says when it puts a bar holding its length or angle inside a body.
 *
 * The hold is kept, because a joint drag still reshapes a welded body and the
 * hold is what keeps that bar's number. But a welded bar is no longer selected
 * on its own, so the Link panel's padlocks are out of reach: the hold is changed
 * from Distance to Joints on one of the bar's joints. Without a word, a reader
 * who fixed a length and then welded saw a padlock they could not find a way
 * to open (#279).
 *
 * @param bars the bars that were at the joint before the weld and are now a
 * part of a welded body. A compound already welded is left out by the caller:
 * its bars were welded, and told about, before.
 * @param nameOf the name the reader sees for a bar.
 * @returns the sentence, or nothing when no bar held anything.
 */
export function weldHoldNotice(
  bars: readonly RealLink[],
  nameOf: (bar: RealLink) => string
): string | undefined {
  const held = bars.filter((bar) => heldValues(holdOf(bar)).length > 0);
  if (held.length === 0) return undefined;
  const values = new Set(held.flatMap((bar) => heldValues(holdOf(bar))));
  const settings = [
    values.has('length') ? 'Fixed Length' : undefined,
    values.has('angle') ? 'Fixed Angle' : undefined,
  ]
    .filter((one): one is string => one !== undefined)
    .join(' and ');
  if (held.length === 1) {
    const [bar] = held;
    const [a, b] = bar.joints;
    return (
      `Link ${nameOf(bar)} keeps its ${settings} in the welded body. To change it, select ` +
      `joint ${a.name} or ${b.name} and use Distance to Joints.`
    );
  }
  const names = held.map(nameOf);
  const listed = `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return (
    `Links ${listed} keep their ${settings} in the welded body. To change one, select a ` +
    'joint on it and use Distance to Joints.'
  );
}
