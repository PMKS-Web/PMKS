import { crankCycle } from '../../../test-utils/verification/cycle-verification';
import { analyzePmksCycle } from './pmks-cycle-analysis';
import {
  structuralViewDefaults,
  structuralViewRequest,
  structuralSeries,
  structuralValue,
  describeYield,
} from './structural-view';
import type { CycleAnalysisResult, CycleSampleResult } from './cycle-results';

describe('structural analysis view', () => {
  const inputs = () => ({
    ...structuralViewDefaults(),
    memberId: 'AB',
    widthMm: 10,
    heightMm: 20,
    yieldMPa: 250,
    mode: 'dynamic' as const,
    uniformMass: true,
  });

  it('converts explicit mm/MPa inputs once and reproduces the published rod benchmark', () => {
    const fixture = crankCycle();
    const massBefore = fixture.mechanism.links[0].map((l) => JSON.stringify(l.structural));
    const built = structuralViewRequest(fixture.mechanism, fixture.lengthUnit, inputs(), 'project');
    expect(built.reason).toBeUndefined();
    expect(built.request!.section).toEqual({ kind: 'rectangle', widthM: 0.01, heightM: 0.02 });
    expect(built.request!.material!.yieldStrengthPa).toBe(250e6);
    const result = analyzePmksCycle(built.request!);
    expect(result.coverage).toMatchObject({ requested: 361, successful: 361, failed: 0 });
    expect(result.envelope!.maximumVonMises.extremum.valuePa).toBeCloseTo(40000, 3);
    expect(structuralValue(result.samples[0], 'normal')).toBeCloseTo(0.03, 8);
    expect(structuralValue(result.samples[0], 'factor-of-safety')).toBeCloseTo(6250, 3);
    expect(fixture.mechanism.links[0].map((l) => JSON.stringify(l.structural))).toEqual(massBefore);
  });

  it('requires dimensions and an explicit dynamic mass assumption before enabling analysis', () => {
    const fixture = crankCycle();
    const build = (input: ReturnType<typeof structuralViewDefaults>) =>
      structuralViewRequest(fixture.mechanism, fixture.lengthUnit, input, 'project');
    expect(build({ ...inputs(), heightMm: null }).reason).toContain('dimensions');
    expect(build({ ...inputs(), uniformMass: false }).reason).toContain('uniform rod');
    expect(build({ ...inputs(), yieldMPa: -1 }).reason).toContain('yield strength');
    expect(build({ ...inputs(), xi: 1.1 }).reason).toContain('material point');
    expect(build({ ...inputs(), eta: null }).reason).toContain('material point');
    expect(build({ ...inputs(), widthMm: Infinity }).reason).toContain('dimensions');
  });

  it('uses backend mass consistency refusals and never repairs the root mass properties', () => {
    const fixture = crankCycle();
    const root = fixture.mechanism.links[0][0];
    root.mass = 3;
    const built = structuralViewRequest(fixture.mechanism, fixture.lengthUnit, inputs(), 'project');
    expect(built.reason).toBeTruthy();
    expect(built.request).toBeUndefined();
    expect(root.mass).toBe(3);
  });

  it('keeps zero-load and missing-yield FoS states distinct from a finite safety value', () => {
    const fixture = crankCycle();
    const built = structuralViewRequest(
      fixture.mechanism,
      fixture.lengthUnit,
      { ...inputs(), mode: 'static' },
      'project'
    );
    const result = analyzePmksCycle(built.request!);
    const sample = result.samples[0];
    if (sample.status !== 'ok') throw new Error(sample.message);
    expect(structuralValue(sample, 'factor-of-safety')).toBeNull();
    expect(describeYield(sample.stress.conservativeYieldCriterion)).toContain('zero demand');
    const noYield = analyzePmksCycle({ ...built.request!, material: undefined });
    expect(noYield.envelope!.yield.status).toBe('unavailable');
    expect(structuralValue(noYield.samples[0], 'von-mises')).toBe(0);
  });

  it('plots failed samples as null and splits a history at an unknown timestamp', () => {
    const fixture = crankCycle();
    const result = analyzePmksCycle({ ...fixture, sampleIndices: [0, 1, 2] });
    const gap: CycleSampleResult = {
      ...result.samples[1],
      status: 'failed',
      stage: 'equilibrium',
      code: 'singular',
      message: 'Singular sample',
    };
    const incomplete: CycleAnalysisResult = {
      ...result,
      samples: [result.samples[0], gap, result.samples[2]],
    };
    const series = structuralSeries(incomplete, 'von-mises');
    expect(series[0].data[1]).toEqual({ x: gap.timeSeconds, y: null });
    expect(series[1].data[1].y).toBeNull();
    const unknownTime = structuralSeries(
      {
        ...incomplete,
        samples: [result.samples[0], { ...gap, timeSeconds: null }, result.samples[2]],
      },
      'von-mises'
    );
    expect(unknownTime).toHaveLength(4);
    expect(unknownTime.every((segment) => segment.data.length === 1)).toBe(true);
  });

  it('uses an explicit partition and refuses missing members rather than choosing another', () => {
    const fixture = crankCycle();
    expect(structuralViewRequest(undefined, fixture.lengthUnit, inputs()).reason).toContain(
      'mechanism'
    );
    expect(
      structuralViewRequest(
        fixture.mechanism,
        fixture.lengthUnit,
        { ...inputs(), memberId: 'elsewhere' },
        'project'
      ).reason
    ).toContain('member');
    const built = structuralViewRequest(
      fixture.mechanism,
      fixture.lengthUnit,
      { ...inputs(), shape: 'circle', diameterMm: 12 },
      'project'
    );
    expect(built.request!.mechanism).toBe(fixture.mechanism);
    expect(built.request!.section).toEqual({ kind: 'circle', diameterM: 0.012 });
  });
});
