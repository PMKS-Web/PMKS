import { Force } from './force';
import { RealJoint } from './joint';
import { RealLink } from './link';
import { SelectedPart } from './selection';

/**
 * What a group selection holds, as a reader would say it: "2 joints",
 * "1 joint and 1 link", "2 joints, 1 link and 1 force".
 *
 * Only the kinds the selection holds are named. Joined as a sentence rather
 * than with separator dots, which read as a generated label. The panel's title
 * and the right-click card's subtitle both say it, so they say it the same way.
 *
 * `title` capitalizes the nouns for the panel's title, which is Title Case like
 * every heading (`docs/ui-vocabulary.md`); "and" stays lower case, as it does
 * in any title. The card's subtitle is not a heading, so it stays a phrase.
 */
export function selectionCount(
  parts: readonly SelectedPart[],
  casing: 'phrase' | 'title' = 'phrase'
): string {
  const word = (noun: string) =>
    casing === 'title' ? noun.charAt(0).toUpperCase() + noun.slice(1) : noun;
  const counted: [number, string, string][] = [
    [parts.filter((part) => part instanceof RealJoint).length, word('joint'), word('joints')],
    [parts.filter((part) => part instanceof RealLink).length, word('link'), word('links')],
    [parts.filter((part) => part instanceof Force).length, word('force'), word('forces')],
  ];
  const said = counted
    .filter(([howMany]) => howMany > 0)
    // A no-break space, so a title that wraps never leaves a count at the end
    // of one line and its noun at the start of the next ("1 / Force").
    .map(([howMany, one, many]) => `${howMany}\u00a0${howMany === 1 ? one : many}`);
  if (said.length < 2) return said.join('');
  return `${said.slice(0, -1).join(', ')} and ${said[said.length - 1]}`;
}
