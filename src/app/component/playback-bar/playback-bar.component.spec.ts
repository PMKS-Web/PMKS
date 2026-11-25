import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { createMechanismHarness } from '../../../test-utils/mechanism-harness';
import { MechanismBuilder } from '../../services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../services/transcoding/string-transcoder';
import { TEMPLATE_LINKAGES, TemplateID } from '../MODALS/templates/template-linkages';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { PlaybackBarComponent, PlaybackRow } from './playback-bar.component';

/** The transport over a template, with the real mechanism behind it. */
async function createBar(template: TemplateID, synced = true, initialTab: TabID = TabID.EDIT) {
  const harness = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(TEMPLATE_LINKAGES[template]);
  new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
  harness.service.syncMechanisms = synced;
  harness.service.updateMechanism();
  let currentTab = initialTab;
  const tabs = {
    getCurrentTab: () => currentTab,
    isAnalysisMode: () => currentTab === TabID.ANALYZE || currentTab === TabID.FORCE,
    setTab: (next: TabID) => {
      currentTab = next;
    },
  } as unknown as SelectedTabService;
  await TestBed.configureTestingModule({
    imports: [NoopAnimationsModule, PlaybackBarComponent],
    providers: [
      { provide: ActiveObjService, useValue: harness.active },
      { provide: MechanismService, useValue: harness.service },
      { provide: SettingsService, useValue: harness.settings },
      { provide: SelectedTabService, useValue: tabs },
    ],
  }).compileComponents();
  const fixture: ComponentFixture<PlaybackBarComponent> =
    TestBed.createComponent(PlaybackBarComponent);
  fixture.detectChanges();
  return {
    fixture,
    bar: fixture.componentInstance,
    service: harness.service,
    settings: harness.settings,
    setTab: (next: TabID) => {
      currentTab = next;
      fixture.detectChanges();
    },
  };
}

/** A row's own handle, as rendered. */
function handleOf(
  fixture: ComponentFixture<PlaybackBarComponent>,
  row: PlaybackRow
): HTMLInputElement {
  const label = fixture.componentInstance.scrubLabel(row);
  const handles = Array.from(
    (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLInputElement>('input.rowScrubber')
  );
  const handle = handles.find((candidate) => candidate.getAttribute('aria-label') === label);
  if (!handle) throw new Error(`no handle labelled ${label}`);
  return handle;
}

/** Press a row's handle, move it to a value on its 0-1000 track, and let go. */
function releaseAt(
  fixture: ComponentFixture<PlaybackBarComponent>,
  row: PlaybackRow,
  value: number
): void {
  const handle = handleOf(fixture, row);
  handle.dispatchEvent(new Event('pointerdown'));
  handle.value = String(value);
  handle.dispatchEvent(new Event('input'));
  handle.dispatchEvent(new Event('change'));
}

/** Step a row's handle with the keyboard: a key press, then the value it commits. */
function stepTo(
  fixture: ComponentFixture<PlaybackBarComponent>,
  row: PlaybackRow,
  value: number
): void {
  const handle = handleOf(fixture, row);
  handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
  handle.value = String(value);
  handle.dispatchEvent(new Event('input'));
  handle.dispatchEvent(new Event('change'));
}

describe('PlaybackBarComponent scrubbing back to the start', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lands the shared row exactly on the start from a sample short of it', async () => {
    const { fixture, bar, service } = await createBar('4-Bar');
    const row = bar.rows.find((candidate) => candidate.master)!;

    releaseAt(fixture, row, 400);
    expect(service.isAtStartPose()).toBe(false);

    releaseAt(fixture, row, (row.anchorAt ?? 0) + 3);
    expect(service.isAtStartPose()).toBe(true);
  });

  it('lands an unsynced machine on its own start, wherever its seat is', async () => {
    const { fixture, bar, service } = await createBar('Straight_Line_Pair', false);
    const rows = bar.rows.filter((candidate) => candidate.isMechanism);
    expect(rows.length).toBe(2);
    const second = rows[1];

    releaseAt(fixture, second, ((second.anchorAt ?? 0) + 500) % 1000);
    expect(service.isAtStartPose()).toBe(false);

    releaseAt(fixture, second, (second.anchorAt ?? 0) + 3);
    expect(service.isAtStartPose()).toBe(true);
  });

  it('leaves a handle well clear of the seat where it was put', async () => {
    const { fixture, bar, service } = await createBar('4-Bar');
    const row = bar.rows.find((candidate) => candidate.master)!;

    releaseAt(fixture, row, (row.anchorAt ?? 0) + 60);
    expect(service.isAtStartPose()).toBe(false);
  });

  it('lets an arrow key step the handle off the seat', async () => {
    const { fixture, bar, service } = await createBar('4-Bar');
    const row = bar.rows.find((candidate) => candidate.master)!;
    const seat = row.anchorAt ?? 0;

    releaseAt(fixture, row, seat + 3);
    expect(service.isAtStartPose()).toBe(true);

    stepTo(fixture, row, seat + 1);
    expect(service.isAtStartPose()).toBe(false);
    expect(handleOf(fixture, row).value).toBe(String(seat + 1));
  });

  it('settles a click that moved nothing on a handle beside its seat', async () => {
    vi.useFakeTimers();
    try {
      const { fixture, bar, service } = await createBar('4-Bar');
      const row = bar.rows.find((candidate) => candidate.master)!;
      const seat = row.anchorAt ?? 0;

      stepTo(fixture, row, seat + 1);
      expect(service.isAtStartPose()).toBe(false);

      handleOf(fixture, row).dispatchEvent(new Event('pointerdown'));
      window.dispatchEvent(new Event('pointerup'));
      vi.runAllTimers();
      expect(service.isAtStartPose()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('waits for the pointer that pressed the handle, not another finger', async () => {
    vi.useFakeTimers();
    try {
      const { fixture, bar, service } = await createBar('4-Bar');
      const row = bar.rows.find((candidate) => candidate.master)!;
      const seat = row.anchorAt ?? 0;
      const pointer = (type: string, pointerId: number) =>
        Object.assign(new Event(type), { pointerId });

      stepTo(fixture, row, seat + 1);
      handleOf(fixture, row).dispatchEvent(pointer('pointerdown', 1));
      window.dispatchEvent(pointer('pointerup', 2));
      vi.runAllTimers();
      expect(service.isAtStartPose()).toBe(false);

      window.dispatchEvent(pointer('pointerup', 1));
      vi.runAllTimers();
      expect(service.isAtStartPose()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not take a key step after a click that moved nothing for a release', async () => {
    const { fixture, bar, service } = await createBar('4-Bar');
    const row = bar.rows.find((candidate) => candidate.master)!;
    const seat = row.anchorAt ?? 0;

    handleOf(fixture, row).dispatchEvent(new Event('pointerdown'));
    stepTo(fixture, row, seat + 1);
    expect(service.isAtStartPose()).toBe(false);
  });
});

describe('PlaybackBarComponent points of interest', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('shows toggle markers in Edit mode and hides max-effort until an analysis mode is active', async () => {
    const { fixture, bar, setTab } = await createBar('Punch_Press', true, TabID.EDIT);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.poiMarker.toggle').length).toBe(2);
    expect(el.querySelectorAll('.poiMarker.maxEffort').length).toBe(0);

    setTab(TabID.ANALYZE);
    expect(el.querySelectorAll('.poiMarker.toggle').length).toBe(2);
    expect(el.querySelectorAll('.poiMarker.maxEffort').length).toBeGreaterThanOrEqual(1);

    setTab(TabID.FORCE);
    expect(el.querySelectorAll('.poiMarker.maxEffort').length).toBeGreaterThanOrEqual(1);

    // Every marker tooltip is a complete sentence ending with a period.
    const row = bar.rows[0];
    for (const marker of bar.markersFor(row)) {
      expect(marker.tooltip.endsWith('.')).toBe(true);
      expect(marker.ariaLabel.startsWith('Jump to ')).toBe(true);
    }
  });

  it('omits markers on the combined All row when synced and shows them per row when unsynced', async () => {
    const { fixture, service } = await createBar('Four_Bar_Inversions', true, TabID.ANALYZE);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelectorAll('.mechRow').length).toBe(1);
    expect(el.querySelectorAll('.poiMarker').length).toBe(0);

    service.setSyncMechanisms(false);
    fixture.detectChanges();
    expect(el.querySelectorAll('.mechRow').length).toBe(4);
    expect(el.querySelectorAll('.poiMarker.toggle').length).toBeGreaterThanOrEqual(4);
  });

  it('jumps directly to a clicked marker pose and pauses playback', async () => {
    const { fixture, bar, service } = await createBar('Punch_Press', true, TabID.FORCE);
    const row = bar.rows[0];
    const target = bar.markersFor(row).find((m) => m.point.kind === 'max-effort')!;
    expect(target).toBeDefined();

    service.setAllPlaying(true);
    fixture.detectChanges();
    expect(service.isMechanismPlaying(row.index)).toBe(true);

    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '.poiMarker.maxEffort'
    )!;
    button.click();
    fixture.detectChanges();

    expect(service.isMechanismPlaying(row.index)).toBe(false);
    expect(service.secondsOf(row.index)).toBeCloseTo(target.point.timeSeconds, 3);
  });

  it('updates max-effort markers when switching between static and dynamic force analysis', async () => {
    const { fixture, bar, settings } = await createBar('Punch_Press', true, TabID.FORCE);
    settings.forceAnalysisMode.next('static');
    fixture.detectChanges();
    const staticTip = bar
      .markersFor(bar.rows[0])
      .find((m) => m.point.kind === 'max-effort')!.tooltip;
    expect(staticTip).toContain('Maximum static input torque');

    settings.forceAnalysisMode.next('dynamic');
    fixture.detectChanges();
    const dynamicTip = bar
      .markersFor(bar.rows[0])
      .find((m) => m.point.kind === 'max-effort')!.tooltip;
    expect(dynamicTip).toContain('Maximum dynamic input torque');
  });
});
