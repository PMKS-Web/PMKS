import { Coord } from './coord';
import { Force } from './force';
import { RevJoint } from './joint';
import { RealLink } from './link';
import { selectionCount } from './selection-count';

// Read with ordinary spaces; the no-break space is checked on its own below.
const said = (...args: Parameters<typeof selectionCount>) =>
  selectionCount(...args).replace(/\u00a0/g, ' ');

describe('selectionCount', () => {
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 1, 0);
  const link = new RealLink('AB', [a, b]);
  const force = new Force('F1', link, new Coord(0, 0), new Coord(0, 1));

  it('names one kind on its own', () => {
    expect(said([a, b])).toBe('2 joints');
  });

  it('joins two kinds with "and"', () => {
    expect(said([a, link])).toBe('1 joint and 1 link');
  });

  it('lists three kinds as a sentence, with no separator dots', () => {
    expect(said([a, b, link, force])).toBe('2 joints, 1 link and 1 force');
  });

  it('keeps each count on the same line as its noun', () => {
    expect(selectionCount([a, link])).toBe('1\u00a0joint and 1\u00a0link');
  });

  it('capitalizes the nouns, and only the nouns, for a title', () => {
    expect(said([a, link, force], 'title')).toBe('1 Joint, 1 Link and 1 Force');
  });
});
