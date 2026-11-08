import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DoCheck,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  ApexAnnotations,
  ApexAxisChartSeries,
  ApexChart,
  ApexXAxis,
  ApexYAxis,
} from 'apexcharts';
import { AnalysisApexChartComponent } from '../analysis-graph/analysis-apex-chart.component';
import { StructuralViewService } from '../../services/structural-view.service';
import { LoadingService } from '../../services/loading.service';
import { ANALYSIS_SERIES_COLORS, formatAnalysisValue } from '../../model/analysis-series';
import {
  describeYield,
  structuralSeries,
  structuralValue,
} from '../../model/structural/structural-view';
import type { CycleAnalysisResult } from '../../model/structural/cycle-results';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { StandardFieldDirective } from '../BLOCKS/standard-field/standard-field.directive';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { TitleBlock } from '../BLOCKS/title/title.component';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';

@Component({
  selector: 'app-structural-panel',
  imports: [
    FormsModule,
    AnalysisApexChartComponent,
    ButtonComponent,
    StandardFieldDirective,
    PanelSectionComponent,
    TitleBlock,
    SegmentedComponent,
    CollapsibleSubsectionComponent,
  ],
  templateUrl: './structural-panel.component.html',
  styleUrl: './structural-panel.component.scss',
  changeDetection: ChangeDetectionStrategy.Eager,
})
export class StructuralPanelComponent implements DoCheck {
  readonly runAnalysis = () => {
    void this.analyze();
  };
  readonly runMotion = () => {
    void this.solveMotion();
  };
  readonly jumpToCritical = () => this.showCritical();
  readonly metrics = ['von-mises', 'normal', 'shear', 'factor-of-safety'] as const;
  readonly gravityModels = ['off', 'lumped-at-com', 'uniform-line'] as const;
  readonly view = inject(StructuralViewService);
  private loading = inject(LoadingService);
  private changeDetector = inject(ChangeDetectorRef);
  readonly format = formatAnalysisValue;
  readonly describeYield = describeYield;
  readonly chart: ApexChart = {
    type: 'line',
    height: 260,
    animations: { enabled: false },
    toolbar: { show: false },
    zoom: { enabled: false },
  };
  readonly colors = [ANALYSIS_SERIES_COLORS.X, ANALYSIS_SERIES_COLORS.Y];
  readonly xaxis: ApexXAxis = {
    type: 'numeric',
    title: { text: 'Time (s)' },
    labels: { formatter: (v) => formatAnalysisValue(Number(v)) },
    tooltip: { enabled: false },
  };
  yaxis: ApexYAxis = {};
  series: ApexAxisChartSeries = [];
  annotations: ApexAnnotations = {};
  busy = false;
  private plotted: CycleAnalysisResult | null = null;
  private plottedMetric = '';
  private markedSample = -1;

  get currentSample() {
    return this.view.mechanisms.currentSampleOf(this.view.mechanismIndex);
  }
  get sample() {
    return this.view.result?.samples.find((s) => s.sampleIndex === this.currentSample);
  }
  get unit() {
    return this.view.metric === 'factor-of-safety' ? '' : 'MPa';
  }
  get reading(): string {
    const sample = this.sample;
    if (!sample || sample.status !== 'ok') return 'Unavailable';
    if (this.view.metric === 'factor-of-safety')
      return describeYield(sample.stress.conservativeYieldCriterion);
    const value = structuralValue(sample, this.view.metric);
    return value === null ? 'Unavailable' : formatAnalysisValue(value);
  }
  get failures(): string[] {
    const result = this.view.result;
    if (!result) return [];
    return [
      ...new Set([
        ...(result.setupFailure ? [result.setupFailure.message] : []),
        ...result.samples.flatMap((s) => (s.status === 'failed' ? [s.message] : [])),
      ]),
    ];
  }

  ngDoCheck(): void {
    this.view.sync();
    if (this.plotted !== this.view.result || this.plottedMetric !== this.view.metric) {
      this.plotted = this.view.result;
      this.plottedMetric = this.view.metric;
      this.series = this.plotted ? structuralSeries(this.plotted, this.view.metric) : [];
      this.yaxis = {
        title: { text: this.unit || 'Factor of Safety' },
        labels: { formatter: formatAnalysisValue },
      };
      this.markedSample = -1;
    }
    if (this.markedSample !== this.currentSample) {
      this.markedSample = this.currentSample;
      const time = this.sample?.timeSeconds;
      this.annotations =
        time === null || time === undefined
          ? {}
          : {
              xaxis: [{ x: time, borderColor: ANALYSIS_SERIES_COLORS.Z, strokeDashArray: 3 }],
            };
    }
  }

  async analyze(): Promise<void> {
    this.busy = true;
    try {
      await this.loading.during('Calculating structural histories…', () => this.view.analyze());
    } catch (error) {
      this.view.error =
        error instanceof Error ? error.message : 'Structural analysis could not finish.';
    } finally {
      this.busy = false;
      this.changeDetector.markForCheck();
    }
  }

  async solveMotion(): Promise<void> {
    await this.loading.during('Working out the motion…', () => this.view.mechanisms.solveNow());
    this.view.changed();
    this.changeDetector.markForCheck();
  }

  seek(value: string): void {
    this.view.seek(Number(value));
  }
  showCritical(): void {
    const sample = this.view.result?.envelope?.maximumConservativeVonMises.sample;
    if (sample) this.view.seek(sample.sampleIndex);
  }
}
