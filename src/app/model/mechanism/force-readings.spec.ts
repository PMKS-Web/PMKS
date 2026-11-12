import { ForceAnalysisFrame, ForceAnalysisSeries } from './force-solver';
import { forceReadings } from './force-readings';

/** A frame of a force solve with only what the readings look at filled in. */
function frame(
  status: ForceAnalysisFrame['status'],
  torque: number,
  reactions: Record<string, Record<string, [number, number]>>
): ForceAnalysisFrame {
  return {
    mode: 'static',
    status,
    timeSeconds: 0,
    jointReactionsByLink: new Map(
      Object.entries(reactions).map(([joint, byLink]) => [joint, new Map(Object.entries(byLink))])
    ),
    jointReactions: new Map(),
    guideCouples: new Map(),
    inputEffort: { jointId: 'A', kind: 'torque', valueSI: torque },
    rank: 0,
    residual: 0,
  };
}

const series = (frames: ForceAnalysisFrame[]): ForceAnalysisSeries => ({
  mode: 'static',
  frames,
  successfulFrames: frames.filter((one) => one.status === 'ok').length,
  sharedSupportFrames: 0,
  reactionIndex: { linksByJoint: new Map(), jointsByLink: new Map() },
});

describe('the loads the Force Analysis overview reads', () => {
  it('takes the largest input effort by size, whichever way it turns', () => {
    const readings = forceReadings(
      series([frame('ok', 2, {}), frame('ok', -5, {}), frame('ok', 3, {})]),
      new Set()
    );
    expect(readings.peakInput).toEqual({ kind: 'torque', valueSI: 5 });
  });

  it('names the joint with the largest reaction on any body, over the joints shown', () => {
    const readings = forceReadings(
      series([
        frame('ok', 1, { B: { AB: [3, 4] }, C: { BC: [0, 2], CD: [0, 6] } }),
        // A cylinder's buried end is never shown, however much it carries.
        frame('ok', 1, { N: { barrel: [100, 0] } }),
      ]),
      new Set(['B', 'C'])
    );
    expect(readings.largestReaction).toEqual({ jointId: 'C', valueSI: 6 });
  });

  it('reads nothing off a sample the solver could not solve', () => {
    const readings = forceReadings(
      series([
        frame('singular', 99, { B: { AB: [99, 0] } }),
        frame('ok', 1, { B: { AB: [1, 0] } }),
      ]),
      new Set(['B'])
    );
    expect(readings.peakInput?.valueSI).toBe(1);
    expect(readings.largestReaction?.valueSI).toBe(1);
  });
});
