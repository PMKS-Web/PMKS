/** Presentation only. Never use these sizes for constraints, coordinates, or exports. */
export type DrawingStyle = 'standard' | 'fine' | 'schematic';

export const DRAWING_STYLES: readonly DrawingStyle[] = ['standard', 'fine', 'schematic'];

// One unit of scale draws a pin with diameter 0.3. Marks are part of the
// drawing: they grow and shrink with zoom exactly as the links' lengths, the
// grid and a background image do. The limits only catch the extremes, where a
// pin would vanish into a speck or swallow the screen. In screen pixels a
// Standard pin's diameter is 0.3 * scale * zoom, so these are 4.5–90px for
// Standard, 3.9–54px for Fine and 3.6–42px for Schematic.
const STYLES = {
  standard: { factor: 1, min: 15, max: 300 },
  fine: { factor: 0.6, min: 13, max: 180 },
  schematic: { factor: 0.48, min: 12, max: 140 },
} as const;

export function drawingScale(base: number, zoom: number, style: DrawingStyle): number {
  const { factor, min, max } = STYLES[style];
  if (!(zoom > 0) || !Number.isFinite(zoom)) return base * factor;
  return Math.max(min, Math.min(max, base * factor * zoom)) / zoom;
}

export function readDrawingStyle(): DrawingStyle {
  try {
    const stored = localStorage.getItem('drawingStyle');
    if (DRAWING_STYLES.includes(stored as DrawingStyle)) return stored as DrawingStyle;
    return localStorage.getItem('lineDrawing') === 'true' ? 'schematic' : 'standard';
  } catch {
    return 'standard';
  }
}

export function storeDrawingStyle(style: DrawingStyle): void {
  try {
    localStorage.setItem('drawingStyle', style);
  } catch {
    // A private or embedded view can still choose a style for this visit.
  }
}
