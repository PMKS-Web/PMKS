import { RevJoint } from './joint';
import { RealLink } from './link';
import { distanceNeighbors } from './joint-distances';
import { heldBars } from './link-holds';
import { holdChips } from './hold-chips';
import { pickLink } from './link-pick';

const a = new RevJoint('A', 0, 0);
const b = new RevJoint('B', 2, 0);
const c = new RevJoint('C', 2, 2);
const d = new RevJoint('D', 4, 0);
const e = new RevJoint('E', 6, 0);
function assembly() {
  const triangle = new RealLink('ABC', [a, b, c]);
  const bar = new RealLink('BD', [b, d]);
  const compound = new RealLink('ABCD', [a, b, c, d]);
  compound.subset = [triangle, bar];
  return { triangle, bar, compound };
}
/** Three bars welded end to end: A–B–D–E. */
function chain() {
  const ab = new RealLink('AB', [a, b]);
  const bd = new RealLink('BD', [b, d]);
  const de = new RealLink('DE', [d, e]);
  const body = new RealLink('ABDE', [a, b, d, e]);
  body.subset = [ab, bd, de];
  return { ab, bd, de, body };
}
const joints = (rows: ReturnType<typeof distanceNeighbors>) => rows.map((row) => row.joint);

describe('Distance to Joints', () => {
  it('at a weld lists the plate it is on and the far end of each bar', () => {
    const { compound, bar } = assembly();
    const rows = distanceNeighbors(b, [compound], () => false);
    expect(joints(rows)).toEqual([a, c, d]);
    expect(rows.find((row) => row.joint === d)?.bar).toBe(bar);
    expect(rows.filter((row) => row.joint !== d).every((row) => row.bar === undefined)).toBe(true);
    expect(joints(distanceNeighbors(d, [compound], () => false))).toEqual([b]);
  });

  it('lists only the neighbors along a chain of bars, never its far end', () => {
    const { body, ab, bd, de } = chain();
    expect(distanceNeighbors(a, [body], () => false)).toEqual([{ joint: b, bar: ab }]);
    expect(distanceNeighbors(b, [body], () => false)).toEqual([
      { joint: a, bar: ab },
      { joint: d, bar: bd },
    ]);
    expect(distanceNeighbors(e, [body], () => false)).toEqual([{ joint: d, bar: de }]);
  });

  it('lists nothing for a bar on its own, whose Length is on its panel', () => {
    const lone = new RealLink('AB', [a, b]);
    expect(distanceNeighbors(a, [lone], () => false)).toEqual([]);
  });

  it('omits cylinder members even when they have three joints', () => {
    const { triangle, bar, compound } = assembly();
    expect(distanceNeighbors(b, [compound], (link) => link === triangle || link === bar)).toEqual(
      []
    );
  });
});

describe('a welded bar holding its length', () => {
  it('reaches the solver and wears a chip', () => {
    const { body, bd } = chain();
    bd.hold = 'length';
    expect(heldBars([body]).map((bar) => [bar.id, bar.hold, bar.a, bar.b])).toEqual([
      ['BD', 'length', 'B', 'D'],
    ]);
    expect(holdChips([body], []).map((chip) => chip.id)).toEqual(['BD']);
  });
});

describe('picking a welded body', () => {
  it('selects the body on every click', () => {
    const { triangle, bar, compound } = assembly();
    expect(pickLink([compound], triangle, undefined, () => true)).toBe(compound);
    expect(pickLink([compound], compound, compound, (one) => one === bar)).toBe(compound);
    expect(pickLink([compound], triangle, compound, () => true)).toBe(compound);
  });

  it('still reaches a cylinder member welded into it on the second click', () => {
    const { triangle, bar, compound } = assembly();
    const member = (link: RealLink) => link === bar;
    expect(pickLink([compound], bar, undefined, () => true, member)).toBe(compound);
    expect(pickLink([compound], compound, compound, (one) => one === bar, member)).toBe(bar);
    expect(pickLink([compound], triangle, bar, () => true, member)).toBe(compound);
  });
});
