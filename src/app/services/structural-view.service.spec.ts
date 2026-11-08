import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { crankCycle } from '../../test-utils/verification/cycle-verification';
import { StructuralViewService } from './structural-view.service';
import { StructuralAnalysisService } from './structural-analysis.service';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';
import { LengthUnit } from '../model/unit-enums';
import { analyzePmksCycle } from '../model/structural/pmks-cycle-analysis';
import { DragStateService } from './drag-state.service';

describe('structural view session and partition boundaries', () => {
  function setup(count = 1) {
    const fixture = crankCycle();
    const mechanism = fixture.mechanism;
    const model = {
      mechanisms: Array.from({ length: count }, () => mechanism),
      pauseInPlace: vi.fn(),
      seekMechanism: vi.fn(),
    };
    const settings = { lengthUnit: new BehaviorSubject(LengthUnit.METER) };
    TestBed.configureTestingModule({
      providers: [
        { provide: MechanismService, useValue: model },
        { provide: SettingsService, useValue: settings },
      ],
    });
    const view = TestBed.inject(StructuralViewService);
    view.sync();
    view.input.widthMm = 10;
    view.input.heightMm = 20;
    view.changed();
    const result = analyzePmksCycle(fixture);
    vi.spyOn(TestBed.inject(StructuralAnalysisService), 'analyzeCycle').mockReturnValue(result);
    return { view, model, mechanism, settings, result };
  }

  it('retains results across reads but invalidates them when frames or units change', () => {
    const { view, model, result, settings } = setup();
    view.analyze();
    expect(view.result).toBe(result);
    view.sync();
    expect(view.result).toBe(result);
    settings.lengthUnit.next(LengthUnit.CM);
    view.sync();
    expect(view.result).toBeNull();
    view.analyze();
    model.mechanisms[0] = crankCycle().mechanism;
    view.sync();
    expect(view.result).toBeNull();
  });

  it('requires selection in a multi-mechanism drawing and seeks only that partition', () => {
    const { view, model, mechanism } = setup(2);
    expect(view.mechanismIndex).toBe(-1);
    expect(view.readiness.reason).toContain('Choose a mechanism');
    view.selectMechanism(1);
    view.seek(90);
    expect(model.pauseInPlace).toHaveBeenCalledOnce();
    expect(model.seekMechanism).toHaveBeenCalledExactlyOnceWith(1, mechanism.timeNum[90]);
  });

  it('clears stale results on member removal and never falls back to another member', () => {
    const { view, result } = setup();
    view.analyze();
    expect(view.result).toBe(result);
    view.input.memberId = 'missing';
    view.sync();
    expect(view.result).toBeNull();
    expect(view.readiness.reason).toContain('Choose a member');
  });

  it('hides stale histories while a tuning gesture is in progress', () => {
    const { view } = setup();
    view.analyze();
    const drag = TestBed.inject(DragStateService);
    vi.spyOn(drag, 'isDragging', 'get').mockReturnValue(true);
    vi.spyOn(drag, 'travelled', 'get').mockReturnValue(true);
    view.sync();
    expect(view.result).toBeNull();
    expect(view.readiness.reason).toContain('Finish the drag');
    view.analyze();
    expect(view.result).toBeNull();
  });
});
