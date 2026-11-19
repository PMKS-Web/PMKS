import { linesThrough, snapToLines } from './line-snap';

/** A bar at about 37 degrees: no grid corner lies on it between its ends. */
const A = { x: 0, y: 0 };
const B = { x: 4, y: 3 };
const bar = linesThrough([A, B]);

/** Signed distance of a point from the bar's line. */
const offLine = (p: { x: number; y: number }) => (p.x * 3 - p.y * 4) / 5;

describe('snapToLines', () => {
  it('puts a point nearly on a slanted bar exactly on its line', () => {
    const snapped = snapToLines({ x: 2, y: 1.6 }, bar, [], 0.2)!;
    expect(offLine(snapped.point)).toBeCloseTo(0, 12);
    // The foot of the perpendicular, so the point moves only across the bar.
    expect(snapped.point.x).toBeCloseTo(2.048, 9);
    expect(snapped.point.y).toBeCloseTo(1.536, 9);
  });

  it('leaves a point clear of the line alone', () => {
    expect(snapToLines({ x: 2, y: 2.5 }, bar, [], 0.2)).toBeUndefined();
  });

  it('draws the guide over the whole bar, and past an end the point went beyond', () => {
    const inside = snapToLines({ x: 2, y: 1.55 }, bar, [], 0.2)!;
    expect(inside.guides[0]).toEqual({ x1: 0, y1: 0, x2: 4, y2: 3 });

    const beyond = snapToLines({ x: 8, y: 6.05 }, bar, [], 0.2)!;
    expect(beyond.guides[0].x1).toBeCloseTo(0, 9);
    expect(beyond.guides[0].x2).toBeCloseTo(8.024, 3);
  });

  it('squares up with a neighbor where its axis crosses the line nearby', () => {
    const pivot = { x: 2, y: -5 };
    const snapped = snapToLines({ x: 2.05, y: 1.5 }, bar, [pivot], 0.2)!;
    expect(snapped.point.x).toBeCloseTo(2, 12);
    expect(snapped.point.y).toBeCloseTo(1.5, 12);
    expect(snapped.guides).toHaveLength(2);
    expect(snapped.guides[1]).toEqual({ x1: 2, y1: 1.5, x2: 2, y2: -5 });
  });

  it('picks the nearest of several lines through a plate', () => {
    const lines = linesThrough([A, B, { x: 4, y: 0 }]);
    expect(lines).toHaveLength(3);
    const snapped = snapToLines({ x: 2, y: 0.05 }, lines, [], 0.2)!;
    expect(snapped.point.y).toBeCloseTo(0, 12);
  });

  it('draws no line through two joints in the same place', () => {
    expect(linesThrough([A, { x: 0, y: 0 }])).toEqual([]);
  });
});
