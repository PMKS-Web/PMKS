import { Joint } from './joint';

/** Unwrap an angle time-series (in radians) so continuous rotation has no +/-pi jumps. */
export function unwrapAngles(raw: number[]): number[] {
  if (raw.length === 0) return [];
  const out = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    let delta = raw[i] - raw[i - 1];
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    out.push(out[i - 1] + delta);
  }
  return out;
}

/** Bounding-box diagonal of the mechanism in its start pose. */
export function mechanismSpan(joints0: Joint[]): number {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const j of joints0) {
    minX = Math.min(minX, j.x);
    maxX = Math.max(maxX, j.x);
    minY = Math.min(minY, j.y);
    maxY = Math.max(maxY, j.y);
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

/**
 * Find every interior sample where a scalar output coordinate smoothly stops
 * and reverses while the input continues in the same direction.
 *
 * Uses `dq/du` (step divided by input step direction) so an input reversal at a
 * rocker limit — where both `dq` and `du` flip together — never looks like an
 * output reversal.
 */
export function findSmoothExtrema(
  values: number[],
  times: number[],
  dirs: number[],
  endpoints: boolean[],
  continuous: boolean,
  minExcursion: number
): { sample: number; excursion: number }[] {
  const last = values.length - 1;
  if (last < 3) return [];

  const rates = new Array<number>(last + 1).fill(0);
  let maxRate = 0;
  for (let i = 1; i <= last; i++) {
    const dt = Math.max((times[i] ?? 0) - (times[i - 1] ?? 0), 1e-9);
    const rate = ((values[i] - values[i - 1]) / dt) * (dirs[i] || 1);
    rates[i] = rate;
    maxRate = Math.max(maxRate, Math.abs(rate));
  }
  if (!(maxRate > 0)) return [];
  const rateFloor = maxRate * 1e-5;

  // Walk steps 1..last (and wrap last -> 1 on a continuous cycle).
  const stepOrder: number[] = [];
  for (let i = 1; i <= last; i++) stepOrder.push(i);
  if (continuous) stepOrder.push(1);

  const out: { sample: number; excursion: number }[] = [];
  let prevSign = 0;
  let prevStep = -1;
  let prevDir = 0;

  for (let pos = 0; pos < stepOrder.length; pos++) {
    const step = stepOrder[pos];
    const dir = dirs[step];
    const r = rates[step];
    const sign = Math.abs(r) > rateFloor ? Math.sign(r) : 0;

    // Input changed direction: start a fresh monotonic leg so an input reversal
    // cannot pair a pre-reversal rate with a post-reversal rate.
    if (prevDir !== 0 && dir !== prevDir) {
      prevSign = sign;
      prevStep = sign !== 0 ? step : -1;
      prevDir = dir;
      continue;
    }

    if (sign === 0) {
      prevDir = dir;
      continue;
    }

    if (prevSign !== 0 && sign !== prevSign) {
      // `rates[i]` was multiplied by `dirs[i]`, so undo `dir` to know whether
      // `values` itself peaked (max) or bottomed out (min).
      const isMax = prevSign * (dir || 1) > 0;
      const vertex = pickExtremumVertex(values, prevStep, step, last, isMax);
      if (!endpoints[vertex]) {
        const excursion = monotonicExcursion(values, vertex, last, continuous, dirs, isMax);
        if (excursion >= minExcursion) {
          out.push({ sample: vertex, excursion });
        }
      }
    }

    prevSign = sign;
    prevStep = step;
    prevDir = dir;
  }

  return out;
}

function pickExtremumVertex(
  values: number[],
  fromStep: number,
  toStep: number,
  last: number,
  isMax: boolean
): number {
  const candidates: number[] = [];
  if (toStep >= fromStep) {
    for (let s = fromStep; s <= toStep; s++) {
      candidates.push(s === last ? 0 : s);
    }
    candidates.push(fromStep - 1);
  } else {
    // Wrapped across the seam: fromStep .. last (= 0) .. toStep.
    for (let s = fromStep - 1; s < last; s++) candidates.push(s);
    candidates.push(0);
    for (let s = 1; s < toStep; s++) candidates.push(s);
  }
  let best = candidates[0];
  for (const idx of candidates) {
    if (isMax ? values[idx] > values[best] : values[idx] < values[best]) {
      best = idx;
    }
  }
  return best === last ? 0 : best;
}

/**
 * Measure how far `values` moves monotonically away from `vertex` on each side
 * before reversing or hitting an input direction change. Measuring the full
 * monotonic leg (rather than a short fixed sample window) keeps flat folded
 * toggles and dwell limits intact while still rejecting numerical ripple.
 */
function monotonicExcursion(
  values: number[],
  vertex: number,
  last: number,
  continuous: boolean,
  dirs: number[],
  isMax: boolean
): number {
  const maxSteps = Math.floor(last / 2);
  const v0 = values[vertex];
  const eps = 1e-9;

  const walk = (step: -1 | 1): number => {
    let best = 0;
    let prevIdx = vertex;
    const baseDir =
      dirs[step < 0 ? (vertex === 0 ? last : vertex) : vertex + 1 <= last ? vertex + 1 : 1];
    for (let k = 1; k <= maxSteps; k++) {
      const raw = vertex + step * k;
      let idx: number;
      let stepDir: number;
      if (raw >= 0 && raw <= last) {
        idx = raw === last ? 0 : raw;
        stepDir = step < 0 ? dirs[raw + 1] : dirs[raw];
      } else if (continuous) {
        idx = raw < 0 ? raw + last : raw - last;
        stepDir = step < 0 ? dirs[idx === last - 1 ? last : idx + 1] : dirs[idx];
      } else {
        break;
      }
      if (stepDir !== baseDir) break;
      const away = isMax
        ? values[idx] <= values[prevIdx] + eps
        : values[idx] >= values[prevIdx] - eps;
      if (!away) break;
      best = Math.max(best, Math.abs(values[idx] - v0));
      prevIdx = idx;
    }
    return best;
  };

  return Math.min(walk(-1), walk(1));
}

/**
 * Find samples where a signed geometric indicator (such as `sin(mu)`) strictly
 * changes sign within a monotonic input leg.
 */
export function findZeroCrossings(
  series: number[],
  dirs: number[],
  endpoints: boolean[],
  continuous: boolean,
  minExcursion: number
): number[] {
  const last = series.length - 1;
  if (last < 3) return [];
  const maxAbs = Math.max(...series.map(Math.abs));
  if (maxAbs < minExcursion) return [];
  const zeroFloor = 1e-4;

  const samples: number[] = [];
  for (let i = 0; i < last; i++) samples.push(i);
  if (continuous) {
    // Scan past sample 0 through the first nonzero sample so a crossing landing
    // directly on sample 0 (where series[0] is within zeroFloor) still compares
    // the nonzero signs immediately before and after the seam.
    let firstNonZero = 0;
    while (firstNonZero < last && Math.abs(series[firstNonZero]) <= zeroFloor) {
      firstNonZero++;
    }
    const seamEnd = firstNonZero < last ? firstNonZero : 0;
    for (let i = 0; i <= seamEnd; i++) samples.push(i);
  }

  const out: number[] = [];
  const seen = new Set<number>();
  let prevSign = 0;
  let prevIdx = -1;
  let prevDir = 0;

  for (let pos = 0; pos < samples.length; pos++) {
    const idx = samples[pos];
    const stepDir = dirs[idx === 0 ? (pos === 0 ? 1 : last) : idx];
    if (prevDir !== 0 && stepDir !== prevDir) {
      prevSign = 0;
      prevIdx = -1;
    }
    prevDir = stepDir;

    const val = series[idx];
    const sign = Math.abs(val) > zeroFloor ? Math.sign(val) : 0;
    if (sign === 0) continue;

    if (prevSign !== 0 && sign !== prevSign) {
      const crossing = pickZeroSample(series, prevIdx, idx, last);
      if (!endpoints[crossing] && !seen.has(crossing)) {
        const beforePeak = peakMagnitude(series, crossing, -1, last, continuous, dirs);
        const afterPeak = peakMagnitude(series, crossing, 1, last, continuous, dirs);
        if (Math.min(beforePeak, afterPeak) >= minExcursion) {
          seen.add(crossing);
          out.push(crossing);
        }
      }
    }
    prevSign = sign;
    prevIdx = idx;
  }

  return out;
}

function pickZeroSample(series: number[], from: number, to: number, last: number): number {
  const indices: number[] = [];
  if (to >= from) {
    for (let i = from; i <= to; i++) indices.push(i);
  } else {
    for (let i = from; i < last; i++) indices.push(i);
    for (let i = 0; i <= to; i++) indices.push(i);
  }
  let best = indices[0];
  for (const idx of indices) {
    if (Math.abs(series[idx]) < Math.abs(series[best])) best = idx;
  }
  return best === last ? 0 : best;
}

function peakMagnitude(
  series: number[],
  center: number,
  step: -1 | 1,
  last: number,
  continuous: boolean,
  dirs: number[]
): number {
  const window = Math.min(12, Math.floor(last / 4));
  let peak = 0;
  const baseDir = dirs[center === 0 ? 1 : center];
  for (let k = 1; k <= window; k++) {
    const raw = center + step * k;
    let idx: number;
    if (raw >= 0 && raw < last) {
      idx = raw;
      if (dirs[idx === 0 ? 1 : idx] !== baseDir) break;
    } else if (continuous) {
      idx = ((raw % last) + last) % last;
    } else {
      break;
    }
    peak = Math.max(peak, Math.abs(series[idx]));
  }
  return peak;
}
