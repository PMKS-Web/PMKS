import { Coord } from './coord';
import { RevJoint } from './joint';
import { RealLink } from './link';
import { cylinderGestureEnds } from './cylinder-gesture-ends';

describe('cylinderGestureEnds', () => {
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 2, 0);
  const ab = new RealLink('AB', [a, b]);

  it('puts the base where the gesture started on empty grid', () => {
    const start = { at: new Coord(0, 5) };
    const end = { at: new Coord(3, 5), joint: b };
    expect(cylinderGestureEnds(start, end)).toEqual({ base: start, rodEnd: end });
  });

  it('puts the base where the gesture ended when it started on a joint', () => {
    const start = { at: new Coord(0, 0), joint: a };
    const end = { at: new Coord(3, 5) };
    expect(cylinderGestureEnds(start, end)).toEqual({ base: end, rodEnd: start });
  });

  it('puts the base where the gesture ended when it started on a link', () => {
    const start = { at: new Coord(1, 0), link: ab };
    const end = { at: new Coord(3, 5) };
    expect(cylinderGestureEnds(start, end)).toEqual({ base: end, rodEnd: start });
  });
});
