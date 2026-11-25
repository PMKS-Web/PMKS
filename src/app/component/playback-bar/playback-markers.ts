import { PlaybackPoint } from '../../model/playback-points';
import { TimeUnit } from '../../model/utils';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';

/** One point-of-interest marker rendered on a mechanism's scrub track. */
export interface PlaybackRailMarker {
  readonly point: PlaybackPoint;
  /** Position along the rail in percent (0..100), bound to `--at`. */
  readonly percent: number;
  /** True while the scrubber handle overlaps this marker. */
  readonly covered: boolean;
  /** Complete-sentence tooltip shown on hover. */
  readonly tooltip: string;
  /** Accessible button label. */
  readonly ariaLabel: string;
}

/** Track units within which the 24px scrubber thumb covers a marker. */
const THUMB_COVER_WINDOW = 42;

/** Project a row's points of interest into positioned, tooltip-ready rail markers. */
export function projectPlaybackMarkers(
  points: readonly PlaybackPoint[],
  scrub: number,
  nup: NumberUnitParserService
): PlaybackRailMarker[] {
  if (!points.length) return [];
  return points.map((point) => ({
    point,
    percent: point.at / 10,
    covered: Math.abs(scrub - point.at) < THUMB_COVER_WINDOW,
    tooltip: markerTooltip(point, nup),
    ariaLabel: markerAriaLabel(point, nup),
  }));
}

function markerTooltip(point: PlaybackPoint, nup: NumberUnitParserService): string {
  const time = nup.formatValueAndUnit(point.timeSeconds, TimeUnit.SECOND);
  if (point.kind === 'branch') {
    return `Branch point at ${time}, where the mechanism can switch assembly branches. Click to jump here.`;
  }
  if (point.kind === 'toggle') {
    return `Toggle position at ${time}, where links align and output motion reverses. Click to jump here.`;
  }
  return `Limit position at ${time}, where output motion stops and reverses. Click to jump here.`;
}

function markerAriaLabel(point: PlaybackPoint, nup: NumberUnitParserService): string {
  const time = nup.formatValueAndUnit(point.timeSeconds, TimeUnit.SECOND);
  if (point.kind === 'branch') return `Jump to branch point at ${time}`;
  if (point.kind === 'toggle') return `Jump to toggle position at ${time}`;
  return `Jump to limit position at ${time}`;
}
