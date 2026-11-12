import { Joint, PrisJoint } from '../joint';
import { deg, isGroundPin, unwrap } from './fact-math';
import { MachineContext, movingOnly } from './machine-facts';
import { FourBar, findFourBars } from './relations';
import { inputSeries } from './roles';

/** How far the input goes in one cycle. */
export type InputRange =
  | { kind: 'turn' }
  /** A crank that rocks: degrees between its two ends. */
  | { kind: 'angle'; degrees: number }
  /** A slider or a cylinder: its stroke, in the drawing's length unit. */
  | { kind: 'length'; length: number };

/** The largest reading any joint reaches over the cycle, and which joint reaches it. */
export interface JointPeak {
  joint: Joint;
  /** In the drawing's length unit per second, or per second squared. */
  value: number;
}

/**
 * What the Kinematic Analysis overview says about how a machine moves: each a
 * single number for the whole cycle, read off the samples the graphs plot.
 */
export interface MotionReadings {
  inputRange?: InputRange;
  peakVelocity?: JointPeak;
  peakAcceleration?: JointPeak;
  /** Degrees, the angle between coupler and output, for a four-bar driven by its crank. */
  transmission?: { min: number; max: number };
  /** The slower stroke over the quicker, for an output driven back and forth by a steady full turn. */
  timeRatio?: number;
}

/** A joint's speed or acceleration at one sample, or NaN where it was not solved. */
export type RateAt = (jointId: string, sample: number, rate: 'velocity' | 'acceleration') => number;

/** A crank that goes this far without turning back has turned all the way round. */
const FULL_TURN_DEGREES = 359;

export function motionReadings(machine: MachineContext, rateAt: RateAt): MotionReadings {
  const { ctx, driven } = machine;
  const samples = ctx.samples.time.length;
  const fourBar = inputFourBar(machine);
  return {
    inputRange: inputRange(machine),
    peakVelocity: peakOf(ctx.visible, samples, (id, i) => rateAt(id, i, 'velocity')),
    peakAcceleration: peakOf(ctx.visible, samples, (id, i) => rateAt(id, i, 'acceleration')),
    transmission: fourBar ? transmission(machine, fourBar) : undefined,
    timeRatio: driven ? timeRatio(machine, fourBar) : undefined,
  };
}

function inputRange(machine: MachineContext): InputRange | undefined {
  const input = inputSeries(machine.ctx, machine.driven);
  if (!input?.values.length) return undefined;
  const span = Math.max(...input.values) - Math.min(...input.values);
  if (!input.angle) return { kind: 'length', length: span };
  const reciprocates = machine.ctx.samples.mechanism.reciprocates;
  return !reciprocates && span >= FULL_TURN_DEGREES
    ? { kind: 'turn' }
    : { kind: 'angle', degrees: span };
}

/** The joint that reaches the largest reading at any sample. Ground pins never move, so never win. */
function peakOf(
  joints: Joint[],
  samples: number,
  read: (jointId: string, sample: number) => number
): JointPeak | undefined {
  let best: JointPeak | undefined;
  for (const joint of joints) {
    if (isGroundPin(joint)) continue;
    for (let i = 0; i < samples; i++) {
      const value = read(joint.id, i);
      if (Number.isFinite(value) && value > (best?.value ?? 0)) best = { joint, value };
    }
  }
  return best;
}

/**
 * The four-bar loop whose crank the input turns, laid out so `left` is that
 * crank and `right` the output. None where the input is not one of its ground
 * pivots: a transmission angle measured on some other loop would describe a
 * part the input does not drive directly.
 */
function inputFourBar(machine: MachineContext): FourBar | undefined {
  const { driven } = machine;
  if (!driven || driven instanceof PrisJoint) return undefined;
  for (const loop of findFourBars(movingOnly(machine.ctx))) {
    if (loop.g1 === driven) return loop;
    if (loop.g2 === driven) {
      const { g1, j1, j2, g2, left, coupler, right } = loop;
      return { g1: g2, j1: j2, j2: j1, g2: g1, left: right, coupler, right: left };
    }
  }
  return undefined;
}

/** The angle between the coupler and the output at the output's moving joint, over the cycle. */
function transmission(machine: MachineContext, loop: FourBar): { min: number; max: number } {
  const paths = machine.ctx.samples.paths;
  const a = paths.get(loop.j1.id)!;
  const b = paths.get(loop.j2.id)!;
  const g = paths.get(loop.g2.id)!;
  const angles = b.map(([bx, by], i) => {
    const coupler = [a[i][0] - bx, a[i][1] - by];
    const output = [g[i][0] - bx, g[i][1] - by];
    const cos =
      (coupler[0] * output[0] + coupler[1] * output[1]) /
      (Math.hypot(coupler[0], coupler[1]) * Math.hypot(output[0], output[1]));
    return deg(Math.acos(Math.max(-1, Math.min(1, cos))));
  });
  return { min: Math.min(...angles), max: Math.max(...angles) };
}

/**
 * How much longer the output's slow stroke takes than its quick one.
 *
 * Only where the input turns all the way round, so its time is spread evenly
 * over its angle, and only where the output goes back and forth: the output
 * of a four-bar driven by its crank, or else the first slider on a fixed guide.
 */
function timeRatio(machine: MachineContext, loop: FourBar | undefined): number | undefined {
  if (inputRange(machine)?.kind !== 'turn') return undefined;
  const values = loop ? outputAngles(machine, loop) : sliderTravel(machine);
  if (!values) return undefined;
  const time = machine.ctx.samples.time;
  const period = time[time.length - 1] - time[0];
  if (!(period > 0)) return undefined;
  let low = 0;
  let high = 0;
  values.forEach((value, i) => {
    if (value < values[low]) low = i;
    if (value > values[high]) high = i;
  });
  const out = (((time[high] - time[low]) % period) + period) % period;
  const back = period - out;
  if (!(out > 0) || !(back > 0)) return undefined;
  return Math.max(out, back) / Math.min(out, back);
}

/** The output's angle over the cycle, or none where it turns fully too and has no stroke. */
function outputAngles(machine: MachineContext, loop: FourBar): number[] | undefined {
  const paths = machine.ctx.samples.paths;
  const pivot = paths.get(loop.g2.id)!;
  const end = paths.get(loop.j2.id)!;
  const angles = unwrap(pivot.map((p, i) => Math.atan2(end[i][1] - p[1], end[i][0] - p[0])));
  const sweep = deg(Math.max(...angles) - Math.min(...angles));
  return sweep < FULL_TURN_DEGREES ? angles : undefined;
}

/** Where the first undriven slider on a fixed guide is along that guide, over the cycle. */
function sliderTravel(machine: MachineContext): number[] | undefined {
  const slider = machine.ctx.visible.find(
    (joint): joint is PrisJoint =>
      joint instanceof PrisJoint && joint.ground && joint !== machine.driven
  );
  const path = slider && machine.ctx.samples.paths.get(slider.id);
  if (!slider || !path) return undefined;
  const ux = Math.cos(slider.angle_rad);
  const uy = Math.sin(slider.angle_rad);
  return path.map(([x, y]) => x * ux + y * uy);
}
