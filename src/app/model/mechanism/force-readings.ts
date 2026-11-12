import { ForceAnalysisEffort, ForceAnalysisSeries } from './force-solver';

/**
 * What the Force Analysis overview says about a machine's loads: each one
 * number for the whole cycle, in the solver's own units (N and N·m), read off
 * the same series the graphs plot.
 */
export interface ForceReadings {
  /** The largest effort the input needs at any solved sample, by size. */
  peakInput?: { kind: ForceAnalysisEffort['kind']; valueSI: number };
  /** The joint carrying the largest reaction at any solved sample, and how large. */
  largestReaction?: { jointId: string; valueSI: number };
}

/**
 * The peaks of one force analysis, over the joints a reader can see.
 *
 * A joint where three bodies meet carries a reaction on each, and the largest
 * of them is the one that says how hard the pin is worked.
 */
export function forceReadings(
  series: ForceAnalysisSeries,
  shownJoints: ReadonlySet<string>
): ForceReadings {
  const readings: ForceReadings = {};
  for (const frame of series.frames) {
    if (frame.status !== 'ok') continue;
    const effort = frame.inputEffort;
    if (
      effort &&
      Number.isFinite(effort.valueSI) &&
      Math.abs(effort.valueSI) > (readings.peakInput?.valueSI ?? 0)
    ) {
      readings.peakInput = { kind: effort.kind, valueSI: Math.abs(effort.valueSI) };
    }
    for (const [jointId, byLink] of frame.jointReactionsByLink) {
      if (!shownJoints.has(jointId)) continue;
      for (const [x, y] of byLink.values()) {
        const size = Math.hypot(x, y);
        if (Number.isFinite(size) && size > (readings.largestReaction?.valueSI ?? 0)) {
          readings.largestReaction = { jointId, valueSI: size };
        }
      }
    }
  }
  return readings;
}
