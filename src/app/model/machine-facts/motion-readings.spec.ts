import '../joint';
import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { solvedDrawing } from '../../../test-utils/machine-facts/drawing';
import { machineContext } from './machine-facts';
import { motionReadings, RateAt } from './motion-readings';

/** One machine of a library drawing, read with a rate the test makes up. */
function readingsOf(id: keyof typeof TEMPLATE_LINKAGES, rateAt: RateAt = () => Number.NaN, at = 0) {
  const { partitions, mechanisms } = solvedDrawing(TEMPLATE_LINKAGES[id]);
  const machine = machineContext(partitions[at], mechanisms[at])!;
  return { machine, readings: motionReadings(machine, rateAt) };
}

describe('how a machine moves, as the Kinematic Analysis overview reads it', () => {
  it('gives a crank-rocker its transmission angle range, as the law of cosines does', () => {
    const { machine, readings } = readingsOf('4-Bar');
    // The crank, coupler, rocker and frame, measured at the first sample.
    const paths = machine.ctx.samples.paths;
    const at = (id: string) => paths.get(id)![0];
    const length = (p: string, q: string) => Math.hypot(at(p)[0] - at(q)[0], at(p)[1] - at(q)[1]);
    // 4-Bar: A and D are the ground pivots, A drives, B and C are moving.
    const [a, b, c, d] = [length('A', 'B'), length('B', 'C'), length('C', 'D'), length('A', 'D')];
    const angle = (diagonal: number) =>
      (Math.acos((b * b + c * c - diagonal * diagonal) / (2 * b * c)) * 180) / Math.PI;
    expect(readings.transmission!.min).toBeCloseTo(angle(d - a), 0);
    expect(readings.transmission!.max).toBeCloseTo(angle(d + a), 0);
  });

  it('says the input turns fully, and times a crank-rocker’s two strokes', () => {
    const { readings } = readingsOf('4-Bar');
    expect(readings.inputRange).toEqual({ kind: 'turn', turns: 1 });
    expect(readings.timeRatio).toBeGreaterThan(1);
  });

  it('times a slider-crank by its slider, with no four-bar to measure', () => {
    const { readings } = readingsOf('Slider_Crank');
    expect(readings.inputRange).toEqual({ kind: 'turn', turns: 1 });
    expect(readings.transmission).toBeUndefined();
    expect(readings.timeRatio).toBeGreaterThanOrEqual(1);
  });

  it('gives a shaper’s ram a time ratio well above one', () => {
    const { readings } = readingsOf('Shaper_Quick_Return');
    expect(readings.timeRatio).toBeGreaterThan(1.2);
  });

  it('claims no time ratio where the output turns fully and has no stroke', () => {
    // Whitworth's slotted link goes all the way round, unevenly.
    const { readings } = readingsOf('Whitworth_Quick_Return');
    expect(readings.inputRange).toEqual({ kind: 'turn', turns: 1 });
    expect(readings.timeRatio).toBeUndefined();
  });

  it('measures a rocking input in degrees, and claims no time ratio for it', () => {
    // The fourth inversion is the double-rocker: its input cannot turn fully.
    const { readings } = readingsOf('Four_Bar_Inversions', undefined, 3);
    expect(readings.inputRange?.kind).toBe('angle');
    expect(readings.timeRatio).toBeUndefined();
  });

  it('names the moving joint with the largest rate, and never a ground pin', () => {
    // A made-up rate: joint C is fastest at the tenth sample.
    const rateAt: RateAt = (id, sample) => (id === 'C' && sample === 10 ? 50 : 1);
    const { readings } = readingsOf('4-Bar', rateAt);
    expect(readings.peakVelocity?.joint.id).toBe('C');
    expect(readings.peakVelocity?.value).toBe(50);
    const ground = readingsOf('4-Bar', (id) => (id === 'A' ? 99 : 1)).readings;
    expect(ground.peakAcceleration?.joint.id).not.toBe('A');
  });
});
