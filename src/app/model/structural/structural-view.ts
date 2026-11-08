import type { Mechanism } from '../mechanism/mechanism';
import type { LengthUnit } from '../unit-enums';
import { snapshotPmksConfiguration } from './pmks-configuration';
import type { PmksCycleRequest } from './pmks-cycle-analysis';
import { resolveStructuralMember } from './member';
import { validateMemberMass } from './member-mass';
import { sectionProperties } from './cross-section';
import type { CycleAnalysisResult, CycleSampleResult } from './cycle-results';
import type { YieldCriterion } from './stress-results';

/** Session-only analysis inputs. They never rewrite the drawing's mass, inertia or CoM. */
export interface StructuralViewInputs {
  memberId: string;
  shape: 'rectangle' | 'circle';
  widthMm: number | null;
  heightMm: number | null;
  diameterMm: number | null;
  yieldMPa: number | null;
  mode: 'static' | 'dynamic';
  gravity: 'off' | 'lumped-at-com' | 'uniform-line';
  uniformMass: boolean;
  xi: number | null;
  eta: number | null;
  side: 'left' | 'right';
}

export function structuralViewDefaults(): StructuralViewInputs {
  return {
    memberId: '',
    shape: 'rectangle',
    widthMm: null,
    heightMm: null,
    diameterMm: null,
    yieldMPa: null,
    mode: 'static',
    gravity: 'off',
    uniformMass: false,
    xi: 0.5,
    eta: 1,
    side: 'right',
  };
}

export type StructuralViewRequest =
  { request: PmksCycleRequest; reason?: never } | { reason: string; request?: never };

/** Shares the backend's geometry/mass refusals; the UI only converts explicit input units. */
export function structuralViewRequest(
  mechanism: Mechanism | undefined,
  lengthUnit: LengthUnit,
  input: StructuralViewInputs,
  coordinateSpace: 'model' | 'project' = 'model'
): StructuralViewRequest {
  if (!mechanism) return { reason: 'Choose a mechanism to analyze.' };
  if (!mechanism.isMechanismValid() || !mechanism.timeNum.length)
    return { reason: 'This mechanism has no solved motion. Complete its kinematic setup first.' };
  const root = mechanism.links[0]?.find((link) => link.id === input.memberId);
  if (!root) return { reason: 'Choose a member to analyze.' };
  const member = {
    kind: 'straight-prismatic' as const,
    id: root.id,
    bodyId: root.id,
    startJointId: root.joints[0]?.id ?? '',
    endJointId: root.joints[1]?.id ?? '',
  };
  const snapshot = snapshotPmksConfiguration({
    joints: mechanism.joints[0],
    links: mechanism.links[0],
    lengthUnit,
    coordinateSpace,
  });
  if (snapshot.status !== 'ok') return { reason: snapshot.message };
  const resolved = resolveStructuralMember(snapshot.configuration, member);
  if (resolved.status !== 'ok') return { reason: resolved.message };
  const positive = (value: number | null): value is number =>
    value !== null && Number.isFinite(value) && value > 0;
  if (
    input.shape === 'rectangle'
      ? !positive(input.widthMm) || !positive(input.heightMm)
      : !positive(input.diameterMm)
  )
    return { reason: 'Enter positive section dimensions in millimeters.' };
  const section =
    input.shape === 'rectangle'
      ? {
          kind: 'rectangle' as const,
          widthM: input.widthMm! / 1000,
          heightM: input.heightMm! / 1000,
        }
      : { kind: 'circle' as const, diameterM: input.diameterMm! / 1000 };
  try {
    sectionProperties(section);
  } catch {
    return {
      reason: 'These section dimensions exceed the numerical range. Use finite dimensions.',
    };
  }
  if (
    input.yieldMPa !== null &&
    (!positive(input.yieldMPa) || !Number.isFinite(input.yieldMPa * 1e6))
  )
    return { reason: 'Enter a positive yield strength in MPa, or leave it blank for stress only.' };
  if (
    input.xi === null ||
    !Number.isFinite(input.xi) ||
    input.xi < 0 ||
    input.xi > 1 ||
    input.eta === null ||
    !Number.isFinite(input.eta) ||
    Math.abs(input.eta) > 1
  )
    return {
      reason: 'Set the material point: span fraction from 0 to 1 and depth fraction from −1 to 1.',
    };
  if (input.mode === 'dynamic' && !input.uniformMass && input.gravity !== 'uniform-line')
    return { reason: 'Dynamic stress requires the uniform rod mass assumption. Confirm it below.' };
  const massDistribution =
    input.uniformMass || input.gravity === 'uniform-line'
      ? { kind: 'uniform-line' as const, memberId: member.id }
      : undefined;
  if (input.mode === 'dynamic' || input.gravity === 'uniform-line') {
    const mass = validateMemberMass(resolved.member, resolved.body, massDistribution);
    if (mass.status !== 'ok') return { reason: mass.message };
  }
  return {
    request: {
      mechanism,
      sampleIndices: mechanism.timeNum.map((_, i) => i),
      lengthUnit,
      coordinateSpace,
      member,
      section,
      mode: input.mode,
      material:
        input.yieldMPa === null
          ? undefined
          : {
              name: 'User-specified yield strength',
              yieldStrengthPa: input.yieldMPa * 1e6,
            },
      loading: {
        kind: 'pmks-forces',
        name: 'Applied forces',
        gravityMPerS2: input.gravity === 'off' ? undefined : { x: 0, y: -9.81 },
      },
      recovery: {
        gravityModel: input.gravity === 'off' ? undefined : input.gravity,
        massDistribution,
      },
      materialPoints: [{ id: 'probe', xi: input.xi, eta: input.eta, side: input.side }],
    },
  };
}

export type StructuralMetric = 'von-mises' | 'normal' | 'shear' | 'factor-of-safety';

export function structuralValue(
  sample: CycleSampleResult,
  metric: StructuralMetric
): number | null {
  if (sample.status !== 'ok') return null;
  if (metric === 'von-mises') return sample.stress.maximumVonMises.valuePa / 1e6;
  if (metric === 'factor-of-safety') {
    const criterion = sample.stress.conservativeYieldCriterion;
    return criterion.status === 'available' ? criterion.factorOfSafety : null;
  }
  const point = sample.points.find((p) => p.id === 'probe')?.stress;
  if (!point) return null;
  return (metric === 'normal' ? point.normalStressPa : point.transverseShearStressPa) / 1e6;
}

export function describeYield(criterion: YieldCriterion | undefined): string {
  if (!criterion) return 'Unavailable';
  if (criterion.status !== 'available') return criterion.message;
  if (criterion.factorOfSafetyState === 'unbounded-zero-demand') return 'Unbounded (zero demand)';
  if (criterion.factorOfSafetyState === 'exceeds-numeric-range') return 'Exceeds numerical range';
  return Number(criterion.factorOfSafety!.toPrecision(5)).toString();
}

/** Null stresses remain gaps. A missing timestamp breaks the series instead of inventing time. */
export function structuralSeries(result: CycleAnalysisResult, metric: StructuralMetric) {
  const names =
    metric === 'von-mises'
      ? ['Attained Maximum', 'Conservative Bound']
      : [metric === 'factor-of-safety' ? 'Conservative FoS' : 'Fixed Material Point'];
  return names.flatMap((name, curve) => {
    const segments: { name: string; data: { x: number; y: number | null }[] }[] = [];
    let data: { x: number; y: number | null }[] = [];
    for (const sample of result.samples) {
      if (sample.timeSeconds === null || !Number.isFinite(sample.timeSeconds)) {
        if (data.length) segments.push({ name, data });
        data = [];
        continue;
      }
      const value =
        curve === 1 && sample.status === 'ok'
          ? sample.stress.diagnostics.vonMisesUpperBoundPa / 1e6
          : structuralValue(sample, metric);
      data.push({
        x: sample.timeSeconds,
        y: value !== null && Number.isFinite(value) ? value : null,
      });
    }
    if (data.length) segments.push({ name, data });
    return segments;
  });
}
