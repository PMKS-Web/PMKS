import { blackOnCanvas } from './contrast';
import { paintOf, PART_COLORS } from './joint-colors';

describe('canvas label contrast', () => {
  it('reads every painted part color with a black name', () => {
    for (const color of PART_COLORS) expect(blackOnCanvas(paintOf(color))).toBeGreaterThan(4.5);
  });
  it('is why the darkest navy is painted lighter than it is stored', () => {
    expect(blackOnCanvas('#0d125a')).toBeLessThan(4.5);
    expect(paintOf('#0D125A')).not.toBe('#0D125A');
    expect(paintOf('#B2DFDB')).toBe('#B2DFDB');
  });
});
