import { Injectable, inject } from '@angular/core';
import { RealLink } from '../model/link';
import type { Mechanism } from '../model/mechanism/mechanism';
import type { CycleAnalysisResult } from '../model/structural/cycle-results';
import {
  structuralViewDefaults,
  structuralViewRequest,
  StructuralViewRequest,
  StructuralMetric,
} from '../model/structural/structural-view';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';
import { StructuralAnalysisService } from './structural-analysis.service';
import { DragStateService } from './drag-state.service';

/** Retains analysis setup across mode switches, separately from the undoable document. */
@Injectable({ providedIn: 'root' })
export class StructuralViewService {
  readonly mechanisms = inject(MechanismService);
  private settings = inject(SettingsService);
  private analysis = inject(StructuralAnalysisService);
  private drag = inject(DragStateService);
  input = structuralViewDefaults();
  mechanismIndex = -1;
  metric: StructuralMetric = 'von-mises';
  result: CycleAnalysisResult | null = null;
  readiness: StructuralViewRequest = { reason: 'Choose a mechanism to analyze.' };
  error = '';
  private source?: Mechanism;
  private key = '';

  get mechanism() {
    return this.mechanisms.mechanisms[this.mechanismIndex];
  }
  get members() {
    return (this.mechanism?.links[0] ?? []).filter(
      (link): link is RealLink => link instanceof RealLink
    );
  }

  selectMechanism(index: number): void {
    this.mechanismIndex = index;
    this.selectMember(this.members.length === 1 ? this.members[0].id : '');
  }

  selectMember(id: string): void {
    this.input = { ...structuralViewDefaults(), memberId: id };
    const properties = this.members.find((link) => link.id === id)?.structural;
    const section = properties?.crossSection;
    if (section?.kind === 'rectangle') {
      this.input.widthMm = section.widthM * 1000;
      this.input.heightMm = section.heightM * 1000;
    } else if (section?.kind === 'circle') {
      this.input.shape = 'circle';
      this.input.diameterMm = section.diameterM * 1000;
    }
    this.input.yieldMPa =
      properties?.material?.yieldStrengthPa === undefined
        ? null
        : properties.material.yieldStrengthPa / 1e6;
    this.changed();
  }

  changed(): void {
    this.key = '';
    this.result = null;
    this.error = '';
    this.sync();
  }

  /** Rebuilt frames invalidate results, including edits made while this tab was closed. */
  sync(): void {
    if (this.mechanismIndex === -1 && this.mechanisms.mechanisms.length === 1) {
      this.selectMechanism(0);
      return;
    }
    const tuning = this.drag.isDragging && this.drag.travelled;
    const key = JSON.stringify([
      this.mechanismIndex,
      this.input,
      this.settings.lengthUnit.value,
      tuning,
      this.mechanisms.solvingIsDeferred,
    ]);
    if (this.source === this.mechanism && key === this.key) return;
    this.source = this.mechanism;
    this.key = key;
    this.result = null;
    this.error = '';
    this.readiness = tuning
      ? { reason: 'Finish the drag, then analyze the updated motion.' }
      : this.mechanisms.solvingIsDeferred
        ? { reason: 'Solve the updated motion before analyzing stress.' }
        : structuralViewRequest(this.mechanism, this.settings.lengthUnit.value, this.input);
  }

  analyze(): void {
    this.sync();
    if (this.readiness.request) this.result = this.analysis.analyzeCycle(this.readiness.request);
  }

  seek(sampleIndex: number): void {
    const frames = this.mechanism;
    const time = frames?.timeNum[sampleIndex];
    if (time === undefined || !Number.isFinite(time)) return;
    this.mechanisms.pauseInPlace();
    const seconds = frames.framesRunBackwards && time !== 0 ? frames.cyclePeriod - time : time;
    this.mechanisms.seekMechanism(this.mechanismIndex, seconds);
  }
}
