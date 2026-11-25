/** Presentation only. Never use these sizes for constraints, coordinates, or exports. */
export type DrawingStyle = 'standard' | 'fine' | 'schematic';

export const DRAWING_STYLES: readonly DrawingStyle[] = ['standard', 'fine', 'schematic'];

// Presentation has fixed model proportions. The camera alone changes its screen size.
const STYLES = {
  standard: { factor: 1 },
  fine: { factor: 0.6 },
  schematic: { factor: 0.48 },
} as const;

export function drawingScale(base: number, _zoom: number, style: DrawingStyle): number {
  return base * STYLES[style].factor;
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
