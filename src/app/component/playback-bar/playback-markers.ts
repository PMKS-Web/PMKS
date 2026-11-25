import { PlaybackForceMode, PlaybackPoint } from '../../model/playback-points';
import { FORCE_TO_N, siUnitFactorsForLength } from '../../model/unit-conversions';
import { ForceUnit, LengthUnit, TimeUnit } from '../../model/utils';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';

/** One point-of-interest marker rendered on a mechanism's scrub track. */
export interface PlaybackRailMarker {
  readonly point: PlaybackPoint;
  /** Position along the rail in percent (0..100), bound to `--at`. */
  readonly percent: number;
  /** Vertical offset in px when a toggle and max-effort marker share a spot. */
  readonly offsetY: number;
  /** True while the scrubber handle overlaps this marker. */
  readonly covered: boolean;
  /** Complete-sentence tooltip shown on hover. */
  readonly tooltip: string;
  /** Accessible button label. */
  readonly ariaLabel: string;
}

export interface MarkerFormatContext {
  readonly forceMode: PlaybackForceMode;
  readonly forceUnit: ForceUnit;
  readonly lengthUnit: LengthUnit;
  readonly nup: NumberUnitParserService;
}

/** Track units within which a toggle and max-effort marker stagger vertically. */
const COLLISION_WINDOW = 28;
/** Track units within which the 24px scrubber thumb covers a marker. */
const THUMB_COVER_WINDOW = 42;

/** Project a row's points of interest into positioned, tooltip-ready rail markers. */
export function projectPlaybackMarkers(
  points: readonly PlaybackPoint[],
  scrub: number,
  ctx: MarkerFormatContext
): PlaybackRailMarker[] {
  if (!points.length) return [];
  const kinematic = points.filter((p) => p.kind !== 'max-effort');
  const efforts = points.filter((p) => p.kind === 'max-effort');
  return points.map((point) => {
    const peers = point.kind === 'max-effort' ? kinematic : efforts;
    const collides = peers.some((other) => Math.abs(other.at - point.at) <= COLLISION_WINDOW);
    const offsetY = collides ? (point.kind === 'max-effort' ? -4 : 4) : 0;
    return {
      point,
      percent: point.at / 10,
      offsetY,
      covered: Math.abs(scrub - point.at) < THUMB_COVER_WINDOW,
      tooltip: markerTooltip(point, ctx),
      ariaLabel: markerAriaLabel(point, ctx.nup),
    };
  });
}

function markerTooltip(point: PlaybackPoint, ctx: MarkerFormatContext): string {
  const time = ctx.nup.formatValueAndUnit(point.timeSeconds, TimeUnit.SECOND);
  if (point.kind === 'branch') {
    return `Branch point at ${time}, where the mechanism can switch assembly branches. Click to jump here.`;
  }
  if (point.kind === 'toggle') {
    return `Toggle position at ${time}, where links align and output motion reverses. Click to jump here.`;
  }
  if (point.kind === 'limit') {
    return `Limit position at ${time}, where output motion stops and reverses. Click to jump here.`;
  }
  const modeLabel = ctx.forceMode === 'dynamic' ? 'dynamic' : 'static';
  const value = formatEffort(point.effortSI ?? 0, point.effortKind ?? 'torque', ctx);
  const noun = point.effortKind === 'force' ? 'input force' : 'input torque';
  const scope = point.partialSolve ? 'solved ' : '';
  return `Maximum ${scope}${modeLabel} ${noun} is ${value} at ${time}. Click to jump here.`;
}

function markerAriaLabel(point: PlaybackPoint, nup: NumberUnitParserService): string {
  const time = nup.formatValueAndUnit(point.timeSeconds, TimeUnit.SECOND);
  if (point.kind === 'branch') return `Jump to branch point at ${time}`;
  if (point.kind === 'toggle') return `Jump to toggle position at ${time}`;
  if (point.kind === 'limit') return `Jump to limit position at ${time}`;
  const noun = point.effortKind === 'force' ? 'maximum input force' : 'maximum input torque';
  return `Jump to ${noun} at ${time}`;
}

function formatEffort(valueSI: number, kind: 'torque' | 'force', ctx: MarkerFormatContext): string {
  const forceFactor = 1 / FORCE_TO_N[ctx.forceUnit];
  const display =
    kind === 'force'
      ? valueSI * forceFactor
      : valueSI * (forceFactor / siUnitFactorsForLength(ctx.lengthUnit).distanceToM);
  const label =
    kind === 'force'
      ? ctx.nup.unitLabel(ctx.forceUnit)
      : ctx.nup.torqueLabel(ctx.forceUnit, ctx.lengthUnit);
  const rounded = display.toFixed(2);
  const normalized = Number(rounded) === 0 ? (0).toFixed(2) : rounded;
  return `${normalized} ${label}`;
}
