import { Joint } from './joint';
import { holdList } from './link-holds';
import { BrokenHold, SelectionTransformResult } from './selection-transform';

/**
 * Why the selection box may not turn or resize the group: it would change a
 * length or an angle a bar holds.
 *
 * The fix names the control that releases a hold, as the menu row and the
 * panel's padlock both say it -- Fixed Length, Fixed Angle -- so the reader
 * unlocks it on purpose rather than having the box quietly bend it.
 */
export function groupHoldRefusal(
  broken: readonly BrokenHold[],
  mode: 'rotate' | 'scale',
  joints?: readonly Joint[]
): string {
  const values = new Set(broken.flatMap((hold) => hold.values));
  const controls = [
    values.has('length') ? 'Fixed Length' : undefined,
    values.has('angle') ? 'Fixed Angle' : undefined,
  ].filter((control): control is string => control !== undefined);
  const gesture = mode === 'rotate' ? 'Rotating' : 'Scaling';
  const whose = broken.length === 1 ? 'its' : 'their';
  return (
    `${gesture} the selection would change ${holdList(
      broken.map((hold) => hold.link),
      joints
    )}. ` + `Turn off ${whose} ${controls.join(' and ')} first.`
  );
}

/**
 * The notice for a group transform the box refused: a hold it would bend, or
 * else the Lock holding the selection. A move keeps every length and angle,
 * so only a turn or a resize can be refused for a hold.
 */
export function groupTransformRefusal(
  result: Extract<SelectionTransformResult, { applied: false }>,
  mode: 'translate' | 'rotate' | 'scale',
  joints?: readonly Joint[]
): { key: string; text: string } {
  if (result.reason === 'held' && result.brokenHolds && mode !== 'translate') {
    return {
      key: 'selection.transform-held',
      text: groupHoldRefusal(result.brokenHolds, mode, joints),
    };
  }
  const names = result.lockedJointIds.join(', ');
  return {
    key: 'selection.transform-locked',
    text: `The selection is locked by ${names || 'a lock'}. Unlock it before transforming the group.`,
  };
}
