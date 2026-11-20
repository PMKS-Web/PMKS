import { uniformBodyOf } from './uniform-body';
import { materialOfShape, sharesOf } from './weld-density';

describe('weld density', () => {
  it('measures a bar by its length', () => {
    expect(
      materialOfShape([
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ])
    ).toBeCloseTo(5, 9);
  });

  it('measures a plate by its outline', () => {
    const triangle = [
      { x: 0, y: 0 },
      { x: 3, y: 0 },
      { x: 0, y: 4 },
    ];
    expect(materialOfShape(triangle)).toBeCloseTo(12, 9);
  });

  // A tracer point on the bar's own axis leaves the bar a bar.
  it('measures a bar with a point on its axis by its length', () => {
    const onAxis = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 6, y: 0 },
    ];
    expect(materialOfShape(onAxis)).toBeCloseTo(6, 9);
  });

  // The plate test is uniformBodyOf's own: a tracer a hair off the axis that
  // shapes the body as a rod cannot double the bar's share of a weld's mass.
  it('measures a bar with a point a hair off its axis by its length, as its shape does', () => {
    const nearlyOnAxis = [
      { x: 0, y: 0 },
      { x: 800, y: 0 },
      { x: 400, y: 0.000001 },
    ];
    expect(uniformBodyOf(nearlyOnAxis).gyrationSq).toBeCloseTo((800 * 800) / 12, 3);
    expect(materialOfShape(nearlyOnAxis)).toBeCloseTo(800, 6);
  });

  it('measures a disc by its rim', () => {
    const pin = { x: 0, y: 0 };
    expect(materialOfShape([pin, { x: 2, y: 0 }], pin)).toBeCloseTo(4 * Math.PI, 9);
  });

  it('shares by material, and evenly when there is none', () => {
    expect(sharesOf([6, 2])).toEqual([0.75, 0.25]);
    expect(sharesOf([0, 0])).toEqual([0.5, 0.5]);
  });
});
