/**
 * Whether a mark drawn on a color should be dark or light.
 *
 * A leaf with no imports, because both the canvas and the swatch picker need
 * the same answer and neither should be reaching into the other for it.
 */

/** Rough perceived brightness of a `#rrggbb`, between 0 and 1. */
export function luminanceOf(color: string): number {
  const hex = color.replace('#', '');
  if (hex.length !== 6) return 1;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Above this, a color takes dark ink; below it, light. */
export const INK_FLIPS_AT = 0.55;

/** Names are read against translucent metal on the canvas, not its opaque swatch. */
export function canvasLabelInk(color: string): 'black' | 'white' {
  const hex = color.replace('#', '');
  if (!/^[\da-f]{6}$/i.test(hex)) return 'black';
  const channels = [0, 2, 4].map((at) => {
    const channel = 0.7 * (parseInt(hex.slice(at, at + 2), 16) / 255) + 0.3;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const light = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return (light + 0.05) / 0.05 >= 1.05 / (light + 0.05) ? 'black' : 'white';
}
