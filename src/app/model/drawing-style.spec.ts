import { DRAWING_STYLES, drawingScale, readDrawingStyle, storeDrawingStyle } from './drawing-style';

describe('drawing styles', () => {
  it('keeps model proportions at every zoom, including extreme metric and imperial scales', () => {
    for (const base of [0.0001, 1, 60, 140, 100000]) {
      for (const style of DRAWING_STYLES) {
        const size = drawingScale(base, 1, style);
        for (const zoom of [0.0001, 0.1, 1, 10, 10000]) {
          expect(drawingScale(base, zoom, style)).toBe(size);
        }
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
