import { Injectable, inject } from '@angular/core';
import { RealJoint } from '../model/joint';
import { machineContext } from '../model/machine-facts/machine-facts';
import {
  InputRange,
  JointPeak,
  motionReadings,
  MotionReadings,
} from '../model/machine-facts/motion-readings';
import { ForceAnalysisMode } from '../model/mechanism/force-solver';
import { forceReadings, ForceReadings } from '../model/mechanism/force-readings';
import { Mechanism } from '../model/mechanism/mechanism';
import { MechanismFact } from '../model/mechanism/readiness';
import { AngleUnit } from '../model/unit-enums';
import { FORCE_TO_N, siUnitFactorsForLength } from '../model/unit-conversions';
import { AnalysisSampleService } from './analysis-sample.service';
import { DragStateService } from './drag-state.service';
import { MechanismService } from './mechanism.service';
import { NumberUnitParserService } from './number-unit-parser.service';
import { SettingsService } from './settings.service';

/** A fact that names the joint it was read at, which the panel links to. */
export interface OverviewFact extends MechanismFact {
  at?: RealJoint;
}

/**
 * The numbers the analysis modes' Mechanism Overview adds: how a machine
 * moves in Kinematic Analysis, and what it carries in Force Analysis.
 *
 * Each is read off the same solved samples the graphs plot, so a peak here is
 * the top of a curve a reader can open. Worked out once per solve, and not
 * again while a drag is under way: a peak reads every sample of the cycle.
 */
@Injectable({ providedIn: 'root' })
export class MechanismReadingsService {
  private mechanism = inject(MechanismService);
  private samples = inject(AnalysisSampleService);
  private settings = inject(SettingsService);
  private nup = inject(NumberUnitParserService);
  private dragState = inject(DragStateService);

  /** Input range, peak speed and acceleration, transmission angle and time ratio. */
  kinematicFacts(index: number): OverviewFact[] {
    const readings = this.motionOf(index);
    if (!readings) return [];
    const facts: OverviewFact[] = [];
    if (readings.inputRange) {
      facts.push({ label: 'Input range', value: this.rangeText(readings.inputRange) });
    }
    const length = this.nup.unitLabel(this.settings.lengthUnit.value);
    if (readings.peakVelocity) {
      facts.push(this.peakFact('Peak velocity', readings.peakVelocity, `${length}/s`));
    }
    if (readings.peakAcceleration) {
      facts.push(this.peakFact('Peak acceleration', readings.peakAcceleration, `${length}/s²`));
    }
    if (readings.transmission) {
      const { min, max } = readings.transmission;
      facts.push({
        label: 'Transmission angle',
        value: `${this.angleText(min, false)} to ${this.angleText(max)}`,
      });
    }
    if (readings.timeRatio !== undefined) {
      facts.push({ label: 'Time ratio', value: readings.timeRatio.toFixed(2) });
    }
    return facts;
  }

  /**
   * The largest effort the input needs and the largest joint reaction, under
   * the analysis the Force panels are set to. None where the force analysis
   * cannot be read yet: the setup drawer says why.
   */
  forceFacts(index: number): OverviewFact[] | undefined {
    const readings = this.forcesOf(index);
    if (!readings) return undefined;
    const mode = this.settings.forceAnalysisMode.value;
    const facts: OverviewFact[] = [
      { label: 'Force analysis', value: mode === 'dynamic' ? 'In-motion' : 'Static' },
    ];
    const force = this.settings.forceUnit.value;
    const toForce = 1 / FORCE_TO_N[force];
    if (readings.peakInput) {
      const torque = readings.peakInput.kind === 'torque';
      // A torque is a force times a length: both of the reader's units.
      const scale = torque
        ? toForce / siUnitFactorsForLength(this.settings.lengthUnit.value).distanceToM
        : toForce;
      const unit = torque
        ? this.nup.torqueLabel(force, this.settings.lengthUnit.value)
        : this.nup.unitLabel(force);
      facts.push({
        label: torque ? 'Peak input torque' : 'Peak input force',
        value: `${reading(readings.peakInput.valueSI * scale)} ${unit}`,
      });
    }
    const reaction = readings.largestReaction;
    const joint = reaction && this.jointNamed(reaction.jointId);
    if (reaction && joint) {
      facts.push({
        label: 'Largest joint reaction',
        value: `${reading(reaction.valueSI * toForce)} ${this.nup.unitLabel(force)}`,
        // Nothing carries a load, so no joint carries the most of it.
        at: reaction.valueSI > 0 ? joint : undefined,
      });
    }
    return facts;
  }

  private motionOf(index: number): MotionReadings | undefined {
    const solved = this.solvedAt(index);
    if (!solved) return undefined;
    return this.kept(this.motionCache, index, solved, () => {
      const machine = machineContext(this.mechanism.partitions[index], solved);
      if (!machine) return undefined;
      return motionReadings(machine, (jointId, sample, rate) => {
        const property = rate === 'velocity' ? 'Linear Joint Vel' : 'Linear Joint Acc';
        // X, Y, then the magnitude, already in the drawing's length unit.
        return this.samples.sampleAt(solved, sample, 'kinematic', '', property, jointId)[2];
      });
    });
  }

  private forcesOf(index: number): ForceReadings | undefined {
    const solved = this.solvedAt(index);
    if (!solved || !this.mechanism.forceAnalysisReady()) return undefined;
    const mode: ForceAnalysisMode = this.settings.forceAnalysisMode.value;
    const cache = mode === 'dynamic' ? this.dynamicCache : this.staticCache;
    return this.kept(cache, index, solved, () => {
      const series = solved.getForceAnalysis(mode);
      if (series.successfulFrames === 0) return undefined;
      const shown = new Set(this.shownJointsOf(index).map((joint) => joint.id));
      return forceReadings(series, shown);
    });
  }

  /** The machine at this index, if it runs. */
  private solvedAt(index: number): Mechanism | undefined {
    const solved = this.mechanism.mechanisms[index];
    return solved?.isMechanismValid() ? solved : undefined;
  }

  /**
   * Worked out once per solve. While a drag is under way every move builds a
   * new solve, so the last answer for that machine stands until the release.
   */
  private kept<T>(
    cache: ReadingCache<T>,
    index: number,
    solved: Mechanism,
    work: () => T | undefined
  ): T | undefined {
    if (cache.bySolve.has(solved)) return cache.bySolve.get(solved);
    if (this.dragState.isDragging && cache.lastShown.has(index)) {
      return cache.lastShown.get(index);
    }
    const answer = work();
    cache.bySolve.set(solved, answer);
    cache.lastShown.set(index, answer);
    return answer;
  }

  private motionCache = readingCache<MotionReadings>();
  private staticCache = readingCache<ForceReadings>();
  private dynamicCache = readingCache<ForceReadings>();

  /** The machine's own joints a reader can see: never a cylinder's buried end. */
  private shownJointsOf(index: number): RealJoint[] {
    const own = new Set(this.mechanism.partitions[index]?.ownJoints.map((joint) => joint.id));
    return this.mechanism
      .visibleJoints()
      .filter((joint): joint is RealJoint => joint instanceof RealJoint && own.has(joint.id));
  }

  /** The editable joint with this id, which a part link can select. */
  private jointNamed(id: string): RealJoint | undefined {
    return this.mechanism
      .visibleJoints()
      .find((joint): joint is RealJoint => joint instanceof RealJoint && joint.id === id);
  }

  private peakFact(label: string, peak: JointPeak, unit: string): OverviewFact {
    return {
      label,
      value: `${reading(peak.value)} ${unit}`,
      at: this.jointNamed(peak.joint.id),
    };
  }

  private rangeText(range: InputRange): string {
    if (range.kind === 'turn') return range.turns === 1 ? 'Full turn' : `${range.turns} full turns`;
    if (range.kind === 'angle') return this.angleText(range.degrees);
    return this.nup.formatValueAndUnit(range.length, this.settings.lengthUnit.value);
  }

  /** An angle in the reader's angle unit, with or without the unit after it. */
  private angleText(degrees: number, withUnit = true): string {
    const unit = this.settings.angleUnit.value;
    const text =
      unit === AngleUnit.RADIAN
        ? this.nup.formatValueAndUnit((degrees * Math.PI) / 180, unit)
        : this.nup.formatValueAndUnit(degrees, AngleUnit.DEGREE);
    return withUnit ? text : text.replace(/\s\S+$/, '');
  }
}

interface ReadingCache<T> {
  /** Keyed on the solve, which a rebuild replaces whenever the machine changes. */
  bySolve: WeakMap<Mechanism, T | undefined>;
  /** The answer last given for each machine, kept up while a drag is under way. */
  lastShown: Map<number, T | undefined>;
}

function readingCache<T>(): ReadingCache<T> {
  return { bySolve: new WeakMap(), lastShown: new Map() };
}

/**
 * A peak to three significant figures. Two fixed decimals read a small load as
 * 0.01 and a large one as 1234.57: a fixed number of figures keeps every
 * reading as precise as the next, whatever its size.
 */
export function reading(value: number): string {
  if (value === 0 || !Number.isFinite(value)) return '0';
  // Rounded first, so the figures are counted on the number shown: 999.6
  // becomes 1000, not 999.6 with a decimal to spare, and 1234.5 is 1230.
  const rounded = Number(value.toPrecision(3));
  const decimals = Math.max(0, 2 - Math.floor(Math.log10(Math.abs(rounded))));
  return rounded.toFixed(Math.min(decimals, 100));
}
