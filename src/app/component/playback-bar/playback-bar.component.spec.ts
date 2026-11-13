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

/** The transport over a template, in Edit, with the real mechanism behind it. */
async function createBar(template: TemplateID, synced = true) {
  const harness = createMechanismHarness();
  const decoder = new StringTranscoder();
  decoder.decodeURL(TEMPLATE_LINKAGES[template]);
  new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
  harness.service.syncMechanisms = synced;
  harness.service.updateMechanism();
  const tabs = {
    getCurrentTab: () => TabID.EDIT,
    isAnalysisMode: () => false,
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
  return { fixture, bar: fixture.componentInstance, service: harness.service };
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

  it('does not take a key step after a click that moved nothing for a release', async () => {
    const { fixture, bar, service } = await createBar('4-Bar');
    const row = bar.rows.find((candidate) => candidate.master)!;
    const seat = row.anchorAt ?? 0;

    handleOf(fixture, row).dispatchEvent(new Event('pointerdown'));
    stepTo(fixture, row, seat + 1);
    expect(service.isAtStartPose()).toBe(false);
  });
});
