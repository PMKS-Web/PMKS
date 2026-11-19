import { Force } from './force';
import { DEFAULT_FORCE_COLOR, paintOf } from './joint-colors';

/** Hover preserves the chosen hue; selection keeps the resting ink. */
export function forceInk(force: Force, selected: boolean, playing: boolean): string {
  const color = paintOf(force.color || DEFAULT_FORCE_COLOR);
  return force.showHighlight && !selected && !playing
    ? `color-mix(in srgb, ${color} 82%, white)`
    : color;
}
