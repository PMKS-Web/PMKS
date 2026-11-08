import { DRAWING_STYLES, drawingScale, readDrawingStyle, storeDrawingStyle } from './drawing-style';

describe('drawing styles', () => {
  it('scales with the drawing across ordinary zoom, as the links and grid do', () => {
    // A Standard drawing at base 60: from a quarter of this zoom to four times it, nothing is clamped.
    for (const zoom of [0.25, 0.5, 1, 2, 4]) {
      expect(drawingScale(60, zoom, 'standard')).toBe(60);
    }
  });

  it('stops only where a mark would vanish or fill the screen', () => {
    expect(drawingScale(60, 10, 'standard') * 10).toBe(300);
    expect(drawingScale(60, 0.1, 'standard') * 0.1).toBe(15);
  });

  it('bounds every style at extreme metric and imperial drawing scales', () => {
    for (const base of [0.0001, 1, 140, 100000]) {
      for (const zoom of [0.0001, 0.01, 1, 100, 10000]) {
        const pixels = DRAWING_STYLES.map((style) => drawingScale(base, zoom, style) * zoom);
        expect(pixels.every((p) => p >= 12 - 1e-9 && p <= 300 + 1e-9)).toBe(true);
        expect(pixels[0]).toBeGreaterThan(pixels[1]);
        expect(pixels[1]).toBeGreaterThan(pixels[2]);
      }
    }
  });

  it('uses model proportions before a viewport exists', () => {
    expect(drawingScale(100, 0, 'standard')).toBe(100);
    expect(drawingScale(100, NaN, 'fine')).toBe(60);
  });

  it('migrates Lines once and remembers the complete style thereafter', () => {
    const oldStyle = localStorage.getItem('drawingStyle');
    const oldLines = localStorage.getItem('lineDrawing');
    try {
      localStorage.removeItem('drawingStyle');
      localStorage.setItem('lineDrawing', 'true');
      expect(readDrawingStyle()).toBe('schematic');
      storeDrawingStyle('fine');
      expect(readDrawingStyle()).toBe('fine');
    } finally {
      for (const [key, value] of [
        ['drawingStyle', oldStyle],
        ['lineDrawing', oldLines],
      ]) {
        if (value === null) localStorage.removeItem(key!);
        else localStorage.setItem(key!, value!);
      }
    }
  });
});
