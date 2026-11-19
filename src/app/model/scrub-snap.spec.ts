import { SCRUB_SNAP_PX, SCRUB_THUMB_PX, snapsToStart } from './scrub-snap';

/** An input whose thumb travels 300 pixels. */
const INPUT = 300 + SCRUB_THUMB_PX;

describe('snapsToStart', () => {
  it('takes a handle within a few pixels of the seat as the start', () => {
    // A 300-pixel track: one pixel is a little over three thousandths.
    const perPixel = 1000 / 300;
    expect(snapsToStart(1, 0, INPUT)).toBe(true);
    expect(snapsToStart(SCRUB_SNAP_PX * perPixel, 0, INPUT)).toBe(true);
    expect(snapsToStart((SCRUB_SNAP_PX + 1) * perPixel, 0, INPUT)).toBe(false);
  });

  it('finds a seat part way along the track, from either side', () => {
    expect(snapsToStart(395, 400, INPUT)).toBe(true);
    expect(snapsToStart(405, 400, INPUT)).toBe(true);
    expect(snapsToStart(300, 400, INPUT)).toBe(false);
  });

  it('measures the tolerance on screen, so a wide track asks for more care', () => {
    expect(snapsToStart(10, 0, INPUT)).toBe(true);
    expect(snapsToStart(10, 0, 1200 + SCRUB_THUMB_PX)).toBe(false);
  });

  it("measures over the thumb's travel, not the whole input", () => {
    // A 300-pixel input spreads its thousandths over 276 pixels, so 21 of
    // them are under six pixels and still the start.
    expect(snapsToStart(21, 0, 300)).toBe(true);
    expect(snapsToStart(22, 0, 300)).toBe(false);
  });

  it('has no seat to snap to on a row without one', () => {
    expect(snapsToStart(0, undefined, INPUT)).toBe(false);
  });
});
