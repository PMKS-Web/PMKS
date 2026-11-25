import './joint';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import {
  punchPressFixture,
  toggleClampFixture,
} from '../../test-utils/verification/force-fixtures';
import { fourBarInversionsFixture } from '../../test-utils/verification/inversion-fixtures';
import { togglePressFixture } from '../../test-utils/verification/library-fixtures';
import { TEMPLATE_LINKAGES, TemplateID } from '../component/MODALS/templates/template-linkages';
import { MechanismBuilder } from '../services/transcoding/mechanism-builder';
import { StringTranscoder } from '../services/transcoding/string-transcoder';
import { driveProfileOf } from './mechanism/drive-profile';
import { Mechanism } from './mechanism/mechanism';
import { playbackPointsOf, PlaybackPoint } from './playback-points';

/**
 * Six-bar whose C-E dyad passes through tangency (from toggle-subdivision.spec.ts).
 * The solver cuts the step finer (`hasAddedSamples === true`) at the fold.
 */
const TOGGLE_SIX_BAR =
  '2P.1jO,1E8.8,2n.1011.6O,O,0,0,0.0A,A,3gO,0,0.4G,G,040G,01L6,0.0B,B,040G,2bR,0.0C,C,0F0c,0kK,0.' +
  '0D,D,0A33,08Zy,0.0E,E,0ETW,06sL,0.GF,F,0AYO,0MPj,0..MROA,OA,0,0,1rC,0,303e9f,O,A,,.MRAB,AB,0,0,' +
  '0Ay,1Ij,26A69A,A,B,,.MRGBC,GBC,0,0,07h2,BL,0d125a,G,B,C,,.MRAD,AD,0,0,03CM,04H-,00695C,A,D,,.' +
  'MRGD,GD,0,0,071g,04yX,303e9f,G,D,,.MRCE,CE,0,0,0El3,03oK,B2DFDB,C,E,,.MRDEF,DEF,0,0,0Bhf,0Ccg,' +
  '26A69A,D,E,F,,...N_N';

/** Build a four-bar from link lengths (ground L1, input L2, coupler L3, output L4). */
function fourBarByLengths(
  L1: number,
  L2: number,
  L3: number,
  L4: number,
  startAngleRad: number,
  branch: 1 | -1 = 1
): MechanismFixture {
  const A = { x: 0, y: 0 };
  const D = { x: L1, y: 0 };
  const B = { x: L2 * Math.cos(startAngleRad), y: L2 * Math.sin(startAngleRad) };
  const dx = D.x - B.x;
  const dy = D.y - B.y;
  const d = Math.hypot(dx, dy);
  const reach = (L3 * L3 - L4 * L4 + d * d) / (2 * d);
  const across = Math.sqrt(Math.max(0, L3 * L3 - reach * reach));
  const C = {
    x: B.x + (reach * dx - branch * across * dy) / d,
    y: B.y + (reach * dy + branch * across * dx) / d,
  };
  return {
    joints: [
      { id: 'A', x: A.x, y: A.y, ground: true, input: true },
      { id: 'B', x: B.x, y: B.y },
      { id: 'C', x: C.x, y: C.y },
      { id: 'D', x: D.x, y: D.y, ground: true },
    ],
    links: [
      { joints: 'AB', mass: 1, moi: 0.1 },
      { joints: 'BC', mass: 1, moi: 0.1 },
      { joints: 'CD', mass: 1, moi: 0.1 },
    ],
    inputAngVel: 1,
  };
}

function solveUrl(payload: string) {
  const harness = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(payload);
  new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
  harness.service.updateMechanism();
  return harness;
}

function solveTemplate(id: TemplateID) {
  return solveUrl(TEMPLATE_LINKAGES[id]);
}

function pointsForFixture(
  fixture: MechanismFixture,
  includeMaxEffort = false,
  forceMode: 'static' | 'dynamic' = 'static'
): { mechanism: Mechanism; points: PlaybackPoint[] } {
  const built = buildMechanism(fixture);
  const mechanism = built.mechanism;
  const profile = driveProfileOf(mechanism);
  const points = playbackPointsOf(mechanism, profile, { includeMaxEffort, forceMode });
  return { mechanism, points };
}

function pointsForService(
  harness: ReturnType<typeof createMechanismHarness>,
  index = 0,
  includeMaxEffort = false,
  forceMode: 'static' | 'dynamic' = 'static'
): PlaybackPoint[] {
  const mechanism = harness.service.mechanisms[index];
  const profile = harness.service.driveProfileOf(index);
  return playbackPointsOf(mechanism, profile, { includeMaxEffort, forceMode });
}

describe('playbackPointsOf — toggle & branch positions across Grashof and non-Grashof mechanisms', () => {
  it('marks the two exact crank+coupler collinear toggle positions on a Grashof crank-rocker', () => {
    // Classic Grashof crank-rocker: L1=4, L2=1.5 (shortest=crank), L3=3.5, L4=3
    const { mechanism, points } = pointsForFixture(fourBarByLengths(4, 1.5, 3.5, 3, Math.PI / 3));
    const toggles = points.filter((p) => p.kind === 'toggle');
    expect(toggles).toHaveLength(2);
    // At each toggle, crank AB and coupler BC must be nearly collinear (|sin(angle)| < 0.05).
    for (const pt of toggles) {
      const frame = mechanism.joints[pt.sample];
      const A = frame.find((j) => j.id === 'A')!;
      const B = frame.find((j) => j.id === 'B')!;
      const C = frame.find((j) => j.id === 'C')!;
      const abx = B.x - A.x;
      const aby = B.y - A.y;
      const bcx = C.x - B.x;
      const bcy = C.y - B.y;
      const sinAngle =
        Math.abs(abx * bcy - aby * bcx) / (Math.hypot(abx, aby) * Math.hypot(bcx, bcy));
      expect(sinAngle).toBeLessThan(0.05);
    }
  });

  it('marks zero toggles on a Grashof double-crank (drag-link)', () => {
    // Shortest = ground (L1=1, L2=2, L3=3, L4=2.5)
    const { points } = pointsForFixture(fourBarByLengths(1, 2, 3, 2.5, Math.PI / 3));
    expect(points.filter((p) => p.kind === 'toggle')).toHaveLength(0);
  });

  it('marks the two collinear change-points as branch points on a Parallelogram', () => {
    const harness = solveTemplate('Parallelogram');
    const toggles = pointsForService(harness, 0).filter((p) => p.kind === 'toggle');
    expect(toggles).toHaveLength(2);
    expect(toggles.every((p) => p.toggleReason === 'branch')).toBe(true);
  });

  it('marks zero toggles on a Grashof rocker-crank and puts no POIs at the rocker ends', () => {
    // Shortest = output (L4=1, L1=2.5, L2=2, L3=3); input L2 rocks between its travel limits.
    const { points } = pointsForFixture(fourBarByLengths(2.5, 2, 3, 1, Math.PI / 3));
    const toggles = points.filter((p) => p.kind === 'toggle');
    expect(toggles).toHaveLength(0);
  });

  it('marks the two interior output toggles on a Grashof double-rocker, with none at the ends', () => {
    // Shortest = coupler (L3=1, L1=3, L2=2.5, L4=2); input L2 rocks and passes both
    // extended and folded alignments with coupler L3 inside its swing.
    const { points } = pointsForFixture(fourBarByLengths(3, 2.5, 1, 2, Math.PI / 4));
    const toggles = points.filter((p) => p.kind === 'toggle');
    expect(toggles).toHaveLength(2);
    for (const pt of toggles) {
      expect(pt.at).toBeGreaterThan(20);
      expect(pt.at).toBeLessThan(980);
    }
  });

  it('handles non-Grashof triple-rockers intuitively with zero markers at the ends of the bar', () => {
    // Case 1: Non-Grashof with NO interior output toggles (L1=2, L2=3, L3=2.5, L4=3.2):
    // L2+L3 = 5.5 > L1+L4 = 5.2 (can't align extended), |L2-L3| = 0.5 < |L1-L4| = 1.2 (can't align folded).
    const none = pointsForFixture(fourBarByLengths(2, 3, 2.5, 3.2, Math.PI / 3));
    expect(none.points.filter((p) => p.kind === 'toggle')).toHaveLength(0);

    // Case 2: Non-Grashof with ONE interior output toggle (L1=4, L2=2.5, L3=2.2, L4=3.5):
    // s+l = 2.2+4 = 6.2 > 2.5+3.5 = 6.0 (non-Grashof).
    // L2+L3 = 4.7 < L1+L4 = 7.5 (extended alignment reachable inside swing),
    // |L2-L3| = 0.3 < |L1-L4| = 0.5 (folded alignment NOT reachable).
    const one = pointsForFixture(fourBarByLengths(4, 2.5, 2.2, 3.5, Math.PI / 3));
    const oneToggles = one.points.filter((p) => p.kind === 'toggle');
    expect(oneToggles).toHaveLength(1);
    expect(oneToggles[0].at).toBeGreaterThan(20);
    expect(oneToggles[0].at).toBeLessThan(980);

    // Case 3: Non-Grashof with TWO interior output toggles (L1=4, L2=3, L3=2, L4=3.2):
    // s+l = 2+4 = 6.0? Wait: use L1=4.2, L2=3, L3=2, L4=3.1 -> s+l = 6.2 > 6.1 (non-Grashof),
    // L2+L3 = 5.0 < L1+L4 = 7.3 (extended reachable), |L2-L3| = 1.0 < |L1-L4| = 1.1...
    // Use L1=3.8, L2=3.0, L3=1.8, L4=3.5 -> s+l = 1.8+3.8 = 5.6? No, 3.0+3.5=6.5 (Grashof).
    // For non-Grashof with BOTH interior alignments: need L2+L3 < L1+L4 AND |L2-L3| > |L1-L4|
    // => (L1-L4)^2 < (L2-L3)^2 AND L2+L3 < L1+L4; check: L1=3.5, L4=3.2 (|L1-L4|=0.3, L1+L4=6.7),
    // L2=3.0, L3=2.0 (|L2-L3|=1.0 > 0.3, L2+L3=5.0 < 6.7). s+l = 2.0+3.5 = 5.5 < 3.0+3.2 = 6.2 (that's Grashof!).
    // Algebraically, if L2+L3 < L1+L4 and |L2-L3| > |L1-L4|, then min(L2,L3)+max(L1,L4) is always < sum of others —
    // wait: verify! Non-Grashof triple-rocker has AT MOST ONE interior alignment!
    // Check the other single-interior case (folded only): L1=2.2, L2=3.2, L3=2.0, L4=2.4:
    // s+l = 2.0+3.2 = 5.2 > 2.2+2.4 = 4.6 (non-Grashof!).
    // L2+L3 = 5.2 > L1+L4 = 4.6 (extended NOT reachable), |L2-L3| = 1.2 > |L1-L4| = 0.2 (folded IS reachable!).
    const folded = pointsForFixture(fourBarByLengths(2.2, 3.2, 2.0, 2.4, Math.PI / 3));
    const foldedToggles = folded.points.filter((p) => p.kind === 'toggle');
    expect(foldedToggles).toHaveLength(1);
    expect(foldedToggles[0].at).toBeGreaterThan(20);
    expect(foldedToggles[0].at).toBeLessThan(980);
  });

  it('handles all four mechanisms in the Four-Bar Inversions template', () => {
    const harness = solveTemplate('Four_Bar_Inversions');
    expect(harness.service.mechanisms).toHaveLength(4);
    const counts = harness.service.mechanisms.map(
      (_, i) => pointsForService(harness, i).filter((p) => p.kind === 'toggle').length
    );
    // M1: crank-rocker (2), M2: crank-rocker (2), M3: double-crank (0), M4: double-rocker (1 interior, 0 at ends)
    expect(counts).toEqual([2, 2, 0, 1]);
  });

  it('marks TDC and BDC on a crank-driven Slider-Crank and zero toggles on a Cylinder Boom', () => {
    const sc = solveTemplate('Slider_Crank');
    const scToggles = pointsForService(sc, 0).filter((p) => p.kind === 'toggle');
    expect(scToggles).toHaveLength(2);

    const boom = solveTemplate('Cylinder_Boom');
    const boomToggles = pointsForService(boom, 0).filter((p) => p.kind === 'toggle');
    expect(boomToggles).toHaveLength(0);
  });

  it('marks the interior fold on TOGGLE_SIX_BAR where the solver subdivides', () => {
    const harness = solveUrl(TOGGLE_SIX_BAR);
    const mechanism = harness.service.mechanisms[0];
    expect(mechanism.hasAddedSamples).toBe(true);
    const toggles = pointsForService(harness, 0).filter((p) => p.kind === 'toggle');
    expect(toggles.some((p) => p.toggleReason === 'fold')).toBe(true);
  });

  it('marks interior toggles on Toggle Clamp & Offset-Load Rocker while keeping Locking Pliers ends clear', () => {
    const clamp = solveTemplate('Toggle_Clamp');
    const clampToggles = pointsForService(clamp, 0).filter((p) => p.kind === 'toggle');
    expect(clampToggles).toHaveLength(2);

    const rocker = solveTemplate('Offset_Load_Rocker');
    const rockerToggles = pointsForService(rocker, 0).filter((p) => p.kind === 'toggle');
    expect(rockerToggles).toHaveLength(1);
    expect(rockerToggles[0].at).toBeGreaterThan(20);
    expect(rockerToggles[0].at).toBeLessThan(980);

    // Locking Pliers reaches its over-center toggle at the cylinder stops (0%/100%),
    // so no interior toggle markers clutter the ends of the bar.
    const pliers = solveTemplate('Locking_Pliers');
    const pliersToggles = pointsForService(pliers, 0).filter((p) => p.kind === 'toggle');
    expect(pliersToggles).toHaveLength(0);
  });

  it('never flickers in and out as a joint is dragged continuously within a Grashof class', () => {
    // Sweep crank length from 1.0 to 1.8 in 17 smooth steps inside crank-rocker space.
    let prevPositions: number[] | undefined;
    for (let step = 0; step <= 16; step++) {
      const L2 = 1.0 + step * 0.05;
      const { points } = pointsForFixture(fourBarByLengths(4, L2, 3.5, 3, Math.PI / 3));
      const toggles = points.filter((p) => p.kind === 'toggle');
      expect(toggles).toHaveLength(2);
      const positions = toggles.map((p) => p.at);
      if (prevPositions) {
        for (let k = 0; k < 2; k++) {
          const jump = Math.min(
            Math.abs(positions[k] - prevPositions[k]),
            1000 - Math.abs(positions[k] - prevPositions[k])
          );
          expect(jump).toBeLessThan(35);
        }
      }
      prevPositions = positions;
    }

    // Sweep coupler length smoothly inside strictly non-Grashof single-toggle space
    // (L1=4, L2=2.5, L4=3.5 -> change-point boundary is L3=2.0, so L3 in [2.05, 2.55] is non-Grashof).
    let prevNgAt: number | undefined;
    for (let step = 0; step <= 10; step++) {
      const L3 = 2.05 + step * 0.05;
      const { points } = pointsForFixture(fourBarByLengths(4, 2.5, L3, 3.5, Math.PI / 3));
      const toggles = points.filter((p) => p.kind === 'toggle');
      expect(toggles).toHaveLength(1);
      if (prevNgAt !== undefined) {
        expect(Math.abs(toggles[0].at - prevNgAt)).toBeLessThan(30);
      }
      prevNgAt = toggles[0].at;
    }
  });
});

describe('playbackPointsOf — maximum input torque and force', () => {
  it('marks the peak input torque on Punch Press in static and dynamic modes', () => {
    const staticResult = pointsForFixture(punchPressFixture(), true, 'static');
    const staticPeaks = staticResult.points.filter((p) => p.kind === 'max-effort');
    expect(staticPeaks.length).toBeGreaterThanOrEqual(1);
    expect(staticPeaks[0].effortKind).toBe('torque');
    expect(Math.abs(staticPeaks[0].effortSI ?? 0)).toBeGreaterThan(0);

    // Verify the marked sample matches the true maximum |inputEffort| across all ok frames.
    const series = staticResult.mechanism.getForceAnalysis('static');
    const trueMax = Math.max(
      ...series.frames
        .filter((f) => f.status === 'ok' && f.inputEffort)
        .map((f) => Math.abs(f.inputEffort!.valueSI))
    );
    expect(Math.abs(staticPeaks[0].effortSI!)).toBeCloseTo(trueMax, 6);

    const dynamicResult = pointsForFixture(punchPressFixture(), true, 'dynamic');
    const dynamicPeaks = dynamicResult.points.filter((p) => p.kind === 'max-effort');
    expect(dynamicPeaks.length).toBeGreaterThanOrEqual(1);
    expect(dynamicPeaks[0].effortKind).toBe('torque');
  });

  it('omits max-effort when includeMaxEffort is false (Edit mode)', () => {
    const result = pointsForFixture(punchPressFixture(), false, 'static');
    expect(result.points.filter((p) => p.kind === 'max-effort')).toHaveLength(0);
  });

  it('omits max-effort when static effort is identically zero (no applied forces and gravity off)', () => {
    const result = pointsForFixture(fourBarByLengths(4, 1.5, 3.5, 3, Math.PI / 3), true, 'static');
    expect(result.points.filter((p) => p.kind === 'max-effort')).toHaveLength(0);
  });

  it('reports dynamic peak torque even when gravity is off and no external force is applied', () => {
    const result = pointsForFixture(fourBarByLengths(4, 1.5, 3.5, 3, Math.PI / 3), true, 'dynamic');
    const peaks = result.points.filter((p) => p.kind === 'max-effort');
    expect(peaks.length).toBeGreaterThanOrEqual(1);
    expect(peaks[0].effortKind).toBe('torque');
  });

  it('reports effortKind = force for a cylinder-driven mechanism (Cylinder Boom with gravity)', () => {
    const harness = solveTemplate('Cylinder_Boom');
    for (const link of harness.service.links) {
      if (link.mass === 0) link.mass = 2;
    }
    harness.settings.isGravity.next(true);
    harness.service.updateMechanism();
    const peaks = pointsForService(harness, 0, true, 'static').filter(
      (p) => p.kind === 'max-effort'
    );
    expect(peaks.length).toBeGreaterThanOrEqual(1);
    expect(peaks[0].effortKind).toBe('force');
  });

  it('reflects playback time when a continuously driven mechanism is reversed', () => {
    const { mechanism } = pointsForFixture(punchPressFixture(), true, 'static');
    const reversed = mechanism.withReversedDrive();
    expect(reversed).toBeDefined();
    const profile = driveProfileOf(reversed!);
    const fwdPoints = playbackPointsOf(mechanism, driveProfileOf(mechanism), {
      includeMaxEffort: true,
      forceMode: 'static',
    });
    const revPoints = playbackPointsOf(reversed!, profile, {
      includeMaxEffort: true,
      forceMode: 'static',
    });
    const fwdPeak = fwdPoints.find((p) => p.kind === 'max-effort')!;
    const revPeak = revPoints.find((p) => p.kind === 'max-effort')!;
    expect(revPeak.sample).toBe(fwdPeak.sample);
    if (fwdPeak.timeSeconds > 0) {
      expect(revPeak.timeSeconds).toBeCloseTo(mechanism.cyclePeriod - fwdPeak.timeSeconds, 4);
    }
  });
});
