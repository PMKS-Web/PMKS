import { Coord } from './coord';
import { Force } from './force';
import { anchorToWrite, renameAnchors } from './force-anchor-name';
import { RevJoint } from './joint';
import { RealLink } from './link';

function bar(id: string, from: RevJoint, to: RevJoint): RealLink {
  return new RealLink(id, [from, to]);
}

function forceOn(link: RealLink, anchoredTo?: string): Force {
  const force = new Force('F1', link, new Coord(0.5, 0), new Coord(0.5, 1), false, true, 1);
  force.anchoredTo = anchoredTo;
  return force;
}

describe('force anchor names', () => {
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 1, 0);
  const c = new RevJoint('C', 2, 0);

  it('follows a rename of the bar a force remembers, and leaves the others alone', () => {
    const ab = bar('AB', a, b);
    const moved = forceOn(ab, 'CD');
    const other = forceOn(ab, 'AB');

    renameAnchors([moved, other], 'CD', 'BC');

    expect(moved.anchoredTo).toBe('BC');
    expect(other.anchoredTo).toBe('AB');
  });

  it('writes the remembered member while a welded body still holds it', () => {
    const ab = bar('AB', a, b);
    const bc = bar('BC', b, c);
    const abc = new RealLink('ABC', [a, b, c]);
    abc.subset = [ab, bc];

    expect(anchorToWrite(forceOn(abc, 'BC'), [abc])).toBe('BC');
  });

  it('writes the body that carries the force when the remembered bar is gone', () => {
    const ab = bar('AB', a, b);
    const bc = bar('BC', b, c);
    const abc = new RealLink('ABC', [a, b, c]);
    abc.subset = [ab, bc];

    expect(anchorToWrite(forceOn(abc, 'CD'), [abc])).toBe('ABC');
    expect(anchorToWrite(forceOn(ab), [ab])).toBe('AB');
  });
});
