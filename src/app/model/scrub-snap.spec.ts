import { SCRUB_SNAP_PX, snapsToStart } from './scrub-snap';

describe('snapsToStart', () => {
  it('takes a handle within a few pixels of the seat as the start', () => {
    // A 300-pixel track: one pixel is a little over three thousandths.
    const perPixel = 1000 / 300;
    expect(snapsToStart(1, 0, 300)).toBe(true);
    expect(snapsToStart(SCRUB_SNAP_PX * perPixel, 0, 300)).toBe(true);
    expect(snapsToStart((SCRUB_SNAP_PX + 1) * perPixel, 0, 300)).toBe(false);
  });

  it('finds a seat part way along the track, from either side', () => {
    expect(snapsToStart(395, 400, 300)).toBe(true);
    expect(snapsToStart(405, 400, 300)).toBe(true);
    expect(snapsToStart(300, 400, 300)).toBe(false);
  });

  it('measures the tolerance on screen, so a wide track asks for more care', () => {
    expect(snapsToStart(10, 0, 300)).toBe(true);
    expect(snapsToStart(10, 0, 1200)).toBe(false);
  });

  it('has no seat to snap to on a row without one', () => {
    expect(snapsToStart(0, undefined, 300)).toBe(false);
  });
});
