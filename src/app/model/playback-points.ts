import { GROUND_BODY, resolveActuator } from './actuator';
import { cylindersIn } from './cylinder';
import { Joint, PrisJoint, RealJoint } from './joint';
import { Link } from './link';
import { assignBodies, BodyAssignment, WORLD } from './mechanism/bodies';
import { DriveProfile } from './mechanism/drive-profile';
import { ForceAnalysisMode } from './mechanism/force-solver';
import { Mechanism } from './mechanism/mechanism';
import {
  findSmoothExtrema,
  findZeroCrossings,
  mechanismSpan,
  unwrapAngles,
} from './playback-point-signals';

/**
 * Notable poses along one mechanism's playback rail.
 *
 * Kept in a pure model so both the playback bar and verification specs ask the
 * same question of a solved mechanism. Every toggle position here is detected
 * from an exact sign change (an output reversing while the input moves steadily,
 * or two links crossing through collinearity / slot tangency) plus the solver's
 * own fold subdivisions (`addedSamples`), rather than a soft near-singularity
 * threshold that would flicker in and out while a joint is dragged.
 *
 * Input travel limits of a reciprocating mechanism (rocker or cylinder stops at
 * 0% and 100% of the track) are intentionally excluded so the ends of the bar
 * stay uncluttered.
 */

export type PlaybackForceMode = ForceAnalysisMode;

export type PlaybackPointKind = 'toggle' | 'max-effort';

export type ToggleReason = 'limit' | 'branch' | 'fold';

export interface PlaybackPoint {
  /** Stable identifier for template tracking. */
  readonly id: string;
  readonly kind: PlaybackPointKind;
  /** Why a toggle marker is here; omitted for max-effort markers. */
  readonly toggleReason?: ToggleReason;
  /** Sample index in `mechanism.joints` (0 .. joints.length - 2). */
  readonly sample: number;
  /** Position along the scrub track in range-input units (0..1000). */
  readonly at: number;
  /** Playback clock time in seconds, reflecting `framesRunBackwards`. */
  readonly timeSeconds: number;
  /** Peak input effort in SI units (N·m for torque, N for force). */
  readonly effortSI?: number;
  /** Whether the driven effort is a torque or a linear force. */
  readonly effortKind?: 'torque' | 'force';
}

export interface PlaybackPointOptions {
  /** Whether to include the peak input torque/force marker. */
  readonly includeMaxEffort: boolean;
  /** Static or dynamic force solve when `includeMaxEffort` is true. */
  readonly forceMode: ForceAnalysisMode;
}

const TRACK_UNITS = 1000;
/** Track distance (0..1000) within which two markers of the same kind merge. */
const MERGE_DISTANCE = 20;
/** Margin at each end of a reciprocating track reserved for the travel stops. */
const ENDPOINT_MARGIN = 0.005;
/** Minimum angular sweep (rad) for a grounded body to count as moving. */
const MIN_BODY_SWEEP = 0.02;
/** Minimum excursion (rad) on each side of a reversal to reject float noise. */
const MIN_REVERSAL_EXCURSION = 0.002;
/** Minimum |sin(angle)| excursion on both sides of a collinear branch crossing. */
const MIN_BRANCH_EXCURSION = 0.02;
/** Effort below this SI floor (N·m or N) is treated as identically zero. */
const EFFORT_NOISE_FLOOR = 1e-9;
/** Equal global peaks within this relative margin are all shown (e.g. symmetric cycles). */
const PEAK_TIE_RATIO = 0.999;

const TOGGLE_PRIORITY: Record<ToggleReason, number> = {
  branch: 3,
  fold: 2,
  limit: 1,
};

interface ToggleCandidate {
  readonly sample: number;
  readonly at: number;
  readonly reason: ToggleReason;
  /** Higher wins when two candidates of the same priority merge. */
  readonly strength: number;
}

/**
 * Compute all points of interest along a single valid mechanism's track.
 *
 * Returns markers ordered left-to-right along the rail (`at` ascending).
 */
export function playbackPointsOf(
  mechanism: Mechanism,
  profile: DriveProfile | undefined,
  options: PlaybackPointOptions
): PlaybackPoint[] {
  if (!mechanism.isMechanismValid() || !profile) return [];
  const count = mechanism.joints.length;
  if (count < 4 || profile.along.length !== count) return [];

  const toggles = detectTogglePoints(mechanism, profile);
  const efforts = options.includeMaxEffort
    ? detectMaxEffortPoints(mechanism, profile, options.forceMode)
    : [];

  return [...toggles, ...efforts].sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind));
}

/** Convert a raw sample index into the clock time shown by the transport. */
export function playbackTimeOf(mechanism: Mechanism, sample: number): number {
  const raw = mechanism.timeNum[sample] ?? 0;
  if (!mechanism.framesRunBackwards || raw === 0) return raw;
  const period = mechanism.cyclePeriod;
  return period > 0 ? Math.max(0, period - raw) : raw;
}

function trackPosition(profile: DriveProfile, sample: number): number {
  const along = profile.along[sample] ?? 0;
  return Math.round(Math.min(Math.max(along, 0), 1) * TRACK_UNITS);
}

/**
 * Direction of the input on each step `(i - 1) -> i`, indexed by `i = 1..last`.
 *
 * Derived from `inputAngularVelocities` when nonzero, falling back to the track
 * profile step when the cycle was solved at zero input speed.
 */
function stepDirections(mechanism: Mechanism, profile: DriveProfile): number[] {
  const last = mechanism.joints.length - 1;
  const dirs = new Array<number>(last + 1).fill(0);
  const vels = mechanism.inputAngularVelocities;
  for (let i = 1; i <= last; i++) {
    const v = vels[i] ?? 0;
    if (Math.abs(v) > 1e-12) {
      dirs[i] = Math.sign(v);
    } else {
      const da = (profile.along[i] ?? 0) - (profile.along[i - 1] ?? 0);
      dirs[i] = Math.abs(da) > 1e-12 ? Math.sign(da) : dirs[i - 1] || 1;
    }
  }
  return dirs;
}

/**
 * Samples that sit on or right beside an input reversal (reciprocating travel
 * limits at 0% and 100% of the bar).
 */
function inputEndpointMask(profile: DriveProfile, dirs: number[]): boolean[] {
  const count = profile.along.length;
  const last = count - 1;
  const masked = new Array<boolean>(count).fill(false);
  if (profile.continuous) return masked;

  const markNeighborhood = (sample: number) => {
    for (let offset = -1; offset <= 1; offset++) {
      const idx = (((sample + offset) % last) + last) % last;
      masked[idx] = true;
    }
    if (masked[0]) masked[last] = true;
  };

  for (let i = 1; i < last; i++) {
    if (dirs[i] !== 0 && dirs[i + 1] !== 0 && dirs[i] !== dirs[i + 1]) {
      markNeighborhood(i);
    }
  }
  if (dirs[last] !== 0 && dirs[1] !== 0 && dirs[last] !== dirs[1]) {
    markNeighborhood(0);
  }
  for (let i = 0; i < count; i++) {
    const along = profile.along[i] ?? 0;
    if (along <= ENDPOINT_MARGIN || along >= 1 - ENDPOINT_MARGIN) {
      masked[i] = true;
    }
  }
  return masked;
}

function detectTogglePoints(mechanism: Mechanism, profile: DriveProfile): PlaybackPoint[] {
  const joints0 = mechanism.joints[0];
  const links0 = mechanism.links[0];
  if (!joints0?.length || !links0?.length) return [];

  const dirs = stepDirections(mechanism, profile);
  const endpoints = inputEndpointMask(profile, dirs);
  const assignment = assignBodies(joints0, links0);

  const candidates: ToggleCandidate[] = [
    ...detectFoldPoints(mechanism, profile, endpoints),
    ...detectBranchCrossings(mechanism, profile, dirs, endpoints, assignment),
    ...detectOutputLimits(mechanism, profile, dirs, endpoints, assignment),
  ];

  const merged = mergeToggleCandidates(candidates, profile.continuous);
  return merged.map((item, idx) => ({
    id: `toggle-${idx}-${item.sample}`,
    kind: 'toggle',
    toggleReason: item.reason,
    sample: item.sample,
    at: item.at,
    timeSeconds: playbackTimeOf(mechanism, item.sample),
  }));
}

/**
 * Interior folds where the solver already had to cut the step finer
 * (`mechanism.addedSamples`), e.g. a six-bar dyad passing through tangency.
 */
function detectFoldPoints(
  mechanism: Mechanism,
  profile: DriveProfile,
  endpoints: boolean[]
): ToggleCandidate[] {
  const added = mechanism.addedSamples;
  const last = mechanism.joints.length - 1;
  if (!added.length || !added.some(Boolean)) return [];

  // Collect contiguous runs of subdivided samples in 0 .. last - 1.
  const runs: number[][] = [];
  let current: number[] = [];
  for (let i = 0; i < last; i++) {
    if (added[i]) {
      current.push(i);
    } else if (current.length > 0) {
      runs.push(current);
      current = [];
    }
  }
  if (current.length > 0) runs.push(current);

  // Merge a run that wraps across sample 0 on a continuous cycle.
  if (profile.continuous && runs.length > 1 && runs[0][0] === 0) {
    const tail = runs[runs.length - 1];
    if (tail[tail.length - 1] === last - 1) {
      runs[0] = [...tail, ...runs[0]];
      runs.pop();
    }
  }

  const out: ToggleCandidate[] = [];
  for (const run of runs) {
    let bestSample = run[0];
    let bestSpeed = -1;
    // Include one neighbor on each side of the subdivided span so the exact
    // fold vertex is considered even if it landed on the original spacing.
    const expanded = new Set<number>(run);
    expanded.add((run[0] - 1 + last) % last);
    expanded.add((run[run.length - 1] + 1) % last);
    for (const sample of expanded) {
      if (endpoints[sample]) continue;
      const speed = maxJointSpeedAt(mechanism, sample);
      if (speed > bestSpeed) {
        bestSpeed = speed;
        bestSample = sample;
      }
    }
    if (!endpoints[bestSample] && bestSpeed >= 0) {
      const along = profile.along[bestSample] ?? 0;
      const nearStop = !profile.continuous && (along <= 0.02 || along >= 0.98);
      if (!nearStop) {
        out.push({
          sample: bestSample,
          at: trackPosition(profile, bestSample),
          reason: 'fold',
          strength: bestSpeed,
        });
      }
    }
  }
  return out;
}

function maxJointSpeedAt(mechanism: Mechanism, sample: number): number {
  const last = mechanism.joints.length - 1;
  const prev = sample === 0 ? last - 1 : sample - 1;
  const next = sample + 1 <= last ? sample + 1 : 1;
  const dt = Math.max((mechanism.timeNum[next] ?? 0) - (mechanism.timeNum[prev] ?? 0), 1e-9);
  const a = mechanism.joints[prev];
  const b = mechanism.joints[next];
  if (!a || !b) return 0;
  let worst = 0;
  for (let k = 0; k < a.length; k++) {
    worst = Math.max(worst, Math.hypot(b[k].x - a[k].x, b[k].y - a[k].y) / dt);
  }
  return worst;
}

/** Bodies that belong to the driven input or a hydraulic cylinder's own telescoping members. */
function excludedBodies(joints0: Joint[], links0: Link[], assignment: BodyAssignment): Set<string> {
  const excluded = new Set<string>([WORLD]);
  const driven = joints0.find((j): j is RealJoint => j instanceof RealJoint && j.input);
  if (driven) {
    const actuator = resolveActuator(driven);
    if (actuator && actuator.drivenBody !== GROUND_BODY) {
      excluded.add(assignment.bodyOf(actuator.drivenBody));
    }
  }
  // Cylinder barrels and rods swivel on their mount pins as a triangle side
  // lengthens; their swivel angle can peak at 90 degrees without any toggle.
  for (const cyl of cylindersIn(joints0)) {
    excluded.add(assignment.bodyOf(cyl.barrelRoot));
    excluded.add(assignment.bodyOf(cyl.rodRoot));
  }
  return excluded;
}

/** Joint indices belonging to a given rigid body in frame 0. */
function bodyJointIndices(
  bodyId: string,
  joints0: Joint[],
  links0: Link[],
  assignment: BodyAssignment
): number[] {
  const jointIndex = new Map(joints0.map((j, idx) => [j.id, idx]));
  const seen = new Set<number>();
  for (const link of links0) {
    if (assignment.bodyOf(link) !== bodyId) continue;
    for (const j of link.joints) {
      const idx = jointIndex.get(j.id);
      if (idx !== undefined) seen.add(idx);
    }
  }
  return [...seen];
}

function isGroundedPin(joint: Joint): boolean {
  return joint instanceof RealJoint && joint.ground && !(joint instanceof PrisJoint);
}

function cylinderJointIdsOf(joints0: Joint[]): Set<string> {
  const ids = new Set<string>();
  for (const cyl of cylindersIn(joints0)) {
    ids.add(cyl.seal.id);
    ids.add(cyl.inner.id);
  }
  return ids;
}

/**
 * Output limit / toggle positions (Type I stationary configurations):
 * a grounded passive rocker or grounded passive slider reverses direction
 * while the input continues moving monotonically.
 */
function detectOutputLimits(
  mechanism: Mechanism,
  profile: DriveProfile,
  dirs: number[],
  endpoints: boolean[],
  assignment: BodyAssignment
): ToggleCandidate[] {
  const joints0 = mechanism.joints[0];
  const links0 = mechanism.links[0];
  const frames = mechanism.joints;
  const excluded = excludedBodies(joints0, links0, assignment);
  const cylinderJointIds = cylinderJointIdsOf(joints0);

  const out: ToggleCandidate[] = [];

  // 1. Grounded passive rockers (any moving body pinned to ground, other than
  //    the driven input body and cylinder barrels/rods).
  for (const bodyId of assignment.movingBodies) {
    if (excluded.has(bodyId)) continue;
    const indices = bodyJointIndices(bodyId, joints0, links0, assignment);
    const pivotIdx = indices.find((idx) => isGroundedPin(joints0[idx]));
    if (pivotIdx === undefined) continue;
    const pivot0 = joints0[pivotIdx];
    let farIdx = -1;
    let farDist = 0;
    for (const idx of indices) {
      if (idx === pivotIdx) continue;
      const d = Math.hypot(joints0[idx].x - pivot0.x, joints0[idx].y - pivot0.y);
      if (d > farDist) {
        farDist = d;
        farIdx = idx;
      }
    }
    if (farIdx < 0 || farDist < 1e-6) continue;

    const angles = unwrapAngles(
      frames.map((frame) =>
        Math.atan2(frame[farIdx].y - frame[pivotIdx].y, frame[farIdx].x - frame[pivotIdx].x)
      )
    );
    const sweep = Math.max(...angles) - Math.min(...angles);
    if (sweep < MIN_BODY_SWEEP) continue;

    const vertices = findSmoothExtrema(
      angles,
      mechanism.timeNum,
      dirs,
      endpoints,
      profile.continuous,
      Math.max(MIN_REVERSAL_EXCURSION, sweep * 0.002)
    );
    for (const vertex of vertices) {
      out.push({
        sample: vertex.sample,
        at: trackPosition(profile, vertex.sample),
        reason: 'limit',
        strength: vertex.excursion,
      });
    }
  }

  // 2. Grounded passive sliders (pistons, press rams, shaper rams).
  const span = mechanismSpan(joints0);
  for (let idx = 0; idx < joints0.length; idx++) {
    const joint = joints0[idx];
    if (
      !(joint instanceof PrisJoint) ||
      !joint.ground ||
      joint.input ||
      cylinderJointIds.has(joint.id)
    ) {
      continue;
    }
    const ux = Math.cos(joint.angle_rad);
    const uy = Math.sin(joint.angle_rad);
    const coords = frames.map((frame) => frame[idx].x * ux + frame[idx].y * uy);
    const stroke = Math.max(...coords) - Math.min(...coords);
    if (stroke < Math.max(span * 1e-3, 1e-6)) continue;

    const vertices = findSmoothExtrema(
      coords,
      mechanism.timeNum,
      dirs,
      endpoints,
      profile.continuous,
      stroke * 0.002
    );
    for (const vertex of vertices) {
      out.push({
        sample: vertex.sample,
        at: trackPosition(profile, vertex.sample),
        reason: 'limit',
        strength: vertex.excursion / stroke,
      });
    }
  }

  return out;
}

/**
 * Interior branch / change points where two assembly branches meet and cross:
 * - Coupler-to-grounded-output pin crossing collinearity (`sin(mu)` sign change),
 *   such as a parallelogram, antiparallelogram, or deltoid change-point four-bar.
 * - Connecting rod crossing perpendicular to a passive grounded slider's slot
 *   (`u_rod · u_slot` sign change), where circle-line roots meet and swap branches.
 */
function detectBranchCrossings(
  mechanism: Mechanism,
  profile: DriveProfile,
  dirs: number[],
  endpoints: boolean[],
  assignment: BodyAssignment
): ToggleCandidate[] {
  const joints0 = mechanism.joints[0];
  const links0 = mechanism.links[0];
  const frames = mechanism.joints;
  const excluded = excludedBodies(joints0, links0, assignment);
  const cylinderJointIds = cylinderJointIdsOf(joints0);

  // Classify each moving body as grounded or floating.
  const bodyIndicesMap = new Map<string, number[]>();
  const groundedPivotOf = new Map<string, number>();
  for (const bodyId of assignment.movingBodies) {
    const indices = bodyJointIndices(bodyId, joints0, links0, assignment);
    bodyIndicesMap.set(bodyId, indices);
    const pivot = indices.find((idx) => isGroundedPin(joints0[idx]));
    if (pivot !== undefined) groundedPivotOf.set(bodyId, pivot);
  }

  const out: ToggleCandidate[] = [];

  // 1. Passive moving pin where a floating body (coupler) meets a grounded
  //    passive body (output crank/rocker).
  for (let jIdx = 0; jIdx < joints0.length; jIdx++) {
    const joint = joints0[jIdx];
    if (!(joint instanceof RealJoint) || joint.ground || joint instanceof PrisJoint) continue;
    if (cylinderJointIds.has(joint.id)) continue;

    const bodiesAtJoint = new Set<string>();
    for (const link of links0) {
      if (link.joints.some((candidate) => candidate.id === joint.id)) {
        const b = assignment.bodyOf(link);
        if (b && b !== WORLD) bodiesAtJoint.add(b);
      }
    }
    if (bodiesAtJoint.size < 2) continue;

    const groundedBodies = [...bodiesAtJoint].filter(
      (b) => groundedPivotOf.has(b) && !excluded.has(b)
    );
    const floatingBodies = [...bodiesAtJoint].filter(
      (b) => !groundedPivotOf.has(b) && !excluded.has(b)
    );
    for (const gBody of groundedBodies) {
      const gIdx = groundedPivotOf.get(gBody)!;
      if (gIdx === jIdx) continue;
      for (const fBody of floatingBodies) {
        // Pick another joint on the floating body that connects to a different
        // body (the structural span of the coupler, not a dangling tracer point).
        const fIndices = (bodyIndicesMap.get(fBody) ?? []).filter((idx) => idx !== jIdx);
        const aIdx = pickStructuralJoint(fIndices, fBody, joints0, links0, assignment, jIdx);
        if (aIdx === undefined) continue;

        const cross = frames.map((frame) => {
          const j = frame[jIdx];
          const a = frame[aIdx];
          const g = frame[gIdx];
          const ax = a.x - j.x;
          const ay = a.y - j.y;
          const gx = g.x - j.x;
          const gy = g.y - j.y;
          const denom = Math.hypot(ax, ay) * Math.hypot(gx, gy);
          return denom > 1e-9 ? (ax * gy - ay * gx) / denom : 0;
        });

        const crossings = findZeroCrossings(
          cross,
          dirs,
          endpoints,
          profile.continuous,
          MIN_BRANCH_EXCURSION
        );
        for (const sample of crossings) {
          out.push({
            sample,
            at: trackPosition(profile, sample),
            reason: 'branch',
            strength: 1,
          });
        }
      }
    }
  }

  // 2. Grounded passive slider whose floating connecting rod crosses
  //    perpendicular to the slot (tangency branch switch).
  for (let sIdx = 0; sIdx < joints0.length; sIdx++) {
    const slider = joints0[sIdx];
    if (
      !(slider instanceof PrisJoint) ||
      !slider.ground ||
      slider.input ||
      cylinderJointIds.has(slider.id)
    ) {
      continue;
    }
    const ux = Math.cos(slider.angle_rad);
    const uy = Math.sin(slider.angle_rad);
    const bodiesAtSlider = new Set<string>();
    for (const link of links0) {
      if (link.joints.some((candidate) => candidate.id === slider.id)) {
        const b = assignment.bodyOf(link);
        if (b && b !== WORLD && !groundedPivotOf.has(b) && !excluded.has(b)) {
          bodiesAtSlider.add(b);
        }
      }
    }
    for (const fBody of bodiesAtSlider) {
      const fIndices = (bodyIndicesMap.get(fBody) ?? []).filter((idx) => idx !== sIdx);
      const bIdx = pickStructuralJoint(fIndices, fBody, joints0, links0, assignment, sIdx);
      if (bIdx === undefined) continue;

      const dot = frames.map((frame) => {
        const s = frame[sIdx];
        const b = frame[bIdx];
        const dx = b.x - s.x;
        const dy = b.y - s.y;
        const len = Math.hypot(dx, dy);
        return len > 1e-9 ? (dx * ux + dy * uy) / len : 0;
      });
      const crossings = findZeroCrossings(
        dot,
        dirs,
        endpoints,
        profile.continuous,
        MIN_BRANCH_EXCURSION
      );
      for (const sample of crossings) {
        out.push({
          sample,
          at: trackPosition(profile, sample),
          reason: 'branch',
          strength: 1,
        });
      }
    }
  }

  return out;
}

/**
 * Pick the joint on `bodyId` that closes its loop (shared with another body or
 * grounded), falling back to the joint furthest from `fromIdx`.
 */
function pickStructuralJoint(
  candidates: number[],
  bodyId: string,
  joints0: Joint[],
  links0: Link[],
  assignment: BodyAssignment,
  fromIdx: number
): number | undefined {
  if (candidates.length === 0) return undefined;
  const from = joints0[fromIdx];
  const shared = candidates.filter((idx) => {
    const j = joints0[idx];
    if (j instanceof RealJoint && j.ground) return true;
    return links0.some(
      (link) =>
        assignment.bodyOf(link) !== bodyId && link.joints.some((candidate) => candidate.id === j.id)
    );
  });
  const pool = shared.length > 0 ? shared : candidates;
  let best = pool[0];
  let bestDist = -1;
  for (const idx of pool) {
    const d = Math.hypot(joints0[idx].x - from.x, joints0[idx].y - from.y);
    if (d > bestDist) {
      bestDist = d;
      best = idx;
    }
  }
  return bestDist > 1e-6 ? best : undefined;
}

function trackDistance(a: number, b: number, continuous: boolean): number {
  const raw = Math.abs(a - b);
  return continuous ? Math.min(raw, TRACK_UNITS - raw) : raw;
}

function mergeToggleCandidates(
  candidates: ToggleCandidate[],
  continuous: boolean
): ToggleCandidate[] {
  if (candidates.length === 0) return [];
  // Prefer higher priority (branch > fold > limit), then higher strength, then
  // earlier sample (forward leg on reciprocating cycles).
  const ordered = [...candidates].sort(
    (a, b) =>
      TOGGLE_PRIORITY[b.reason] - TOGGLE_PRIORITY[a.reason] ||
      b.strength - a.strength ||
      a.sample - b.sample
  );
  const kept: ToggleCandidate[] = [];
  for (const candidate of ordered) {
    const duplicate = kept.some(
      (existing) => trackDistance(existing.at, candidate.at, continuous) <= MERGE_DISTANCE
    );
    if (!duplicate) kept.push(candidate);
  }
  return kept.sort((a, b) => a.at - b.at);
}

/**
 * Find the frame(s) of peak input torque or input force across the cycle.
 *
 * Returns nothing when the force solve fails, every frame has zero effort, or
 * the effort is flat across the entire cycle (so no single pose is a peak).
 */
function detectMaxEffortPoints(
  mechanism: Mechanism,
  profile: DriveProfile,
  mode: ForceAnalysisMode
): PlaybackPoint[] {
  const series = mechanism.getForceAnalysis(mode);
  const last = mechanism.joints.length - 1;
  const limit = Math.min(series.frames.length, last);
  if (limit <= 0) return [];

  let maxAbs = 0;
  let minAbs = Infinity;
  let okCount = 0;
  const values: { sample: number; valueSI: number; abs: number; kind: 'torque' | 'force' }[] = [];

  for (let i = 0; i < limit; i++) {
    const frame = series.frames[i];
    if (!frame || frame.status !== 'ok' || !frame.inputEffort) continue;
    const valueSI = frame.inputEffort.valueSI;
    if (!Number.isFinite(valueSI)) continue;
    const abs = Math.abs(valueSI);
    okCount++;
    if (abs > maxAbs) maxAbs = abs;
    if (abs < minAbs) minAbs = abs;
    values.push({ sample: i, valueSI, abs, kind: frame.inputEffort.kind });
  }

  if (okCount === 0 || maxAbs <= EFFORT_NOISE_FLOOR) return [];
  // A completely constant effort (e.g. steady pure load) has no peak pose.
  if (okCount > 1 && maxAbs - minAbs <= maxAbs * 1e-5) return [];

  const peakThreshold = maxAbs * PEAK_TIE_RATIO;
  const peaks = values
    .filter((entry) => entry.abs >= peakThreshold)
    .sort((a, b) => b.abs - a.abs || a.sample - b.sample);

  const kept: typeof peaks = [];
  for (const entry of peaks) {
    const at = trackPosition(profile, entry.sample);
    const duplicate = kept.some(
      (existing) =>
        trackDistance(trackPosition(profile, existing.sample), at, profile.continuous) <=
        MERGE_DISTANCE
    );
    if (!duplicate) kept.push(entry);
  }

  return kept
    .map((entry, idx) => ({
      id: `max-effort-${idx}-${entry.sample}`,
      kind: 'max-effort' as const,
      sample: entry.sample,
      at: trackPosition(profile, entry.sample),
      timeSeconds: playbackTimeOf(mechanism, entry.sample),
      effortSI: entry.valueSI,
      effortKind: entry.kind,
    }))
    .sort((a, b) => a.at - b.at);
}
