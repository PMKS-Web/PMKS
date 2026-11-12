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

/** Let go of a row's handle at a value on its 0-1000 track. */
function releaseAt(bar: PlaybackBarComponent, row: PlaybackRow, value: number): void {
  const input = document.createElement('input');
  input.type = 'range';
  input.min = '0';
  input.max = '1000';
  input.value = String(value);
  bar.scrubRow(row, { target: input } as unknown as Event);
}

describe('PlaybackBarComponent scrubbing back to the start', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('lands the shared row exactly on the start from a sample short of it', async () => {
    const { bar, service } = await createBar('4-Bar');
    const row = bar.rows.find((candidate) => candidate.master)!;

    releaseAt(bar, row, 400);
    expect(service.isAtStartPose()).toBe(false);

    releaseAt(bar, row, (row.anchorAt ?? 0) + 3);
    expect(service.isAtStartPose()).toBe(true);
  });

  it('lands an unsynced machine on its own start, wherever its seat is', async () => {
    const { bar, service } = await createBar('Straight_Line_Pair', false);
    const rows = bar.rows.filter((candidate) => candidate.isMechanism);
    expect(rows.length).toBe(2);
    const second = rows[1];

    releaseAt(bar, second, ((second.anchorAt ?? 0) + 500) % 1000);
    expect(service.isAtStartPose()).toBe(false);

    releaseAt(bar, second, (second.anchorAt ?? 0) + 3);
    expect(service.isAtStartPose()).toBe(true);
  });

  it('leaves a handle well clear of the seat where it was put', async () => {
    const { bar, service } = await createBar('4-Bar');
    const row = bar.rows.find((candidate) => candidate.master)!;

    releaseAt(bar, row, (row.anchorAt ?? 0) + 60);
    expect(service.isAtStartPose()).toBe(false);
  });
});
