import type { MockInstance } from 'vitest';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { AnalyticsService } from './analytics.service';
import { MechanismService } from './mechanism.service';

/** The private pieces of `noticeFirstRun` this spec drives, named once. */
interface FirstRunInternals {
  mechanisms: { isMechanismValid: () => boolean }[];
  partitions: unknown[];
  noticeFirstRun(): void;
}

describe('MechanismService mechanism_runs report', () => {
  let service: MechanismService;
  let internals: FirstRunInternals;
  let track: MockInstance<AnalyticsService['track']>;

  /** Stand in for a rebuild after which the drawing does, or does not, run. */
  function rebuildRunning(runs: boolean): void {
    internals.mechanisms = [{ isMechanismValid: () => runs }];
    internals.partitions = [{}];
    internals.noticeFirstRun();
  }

  beforeEach(() => {
    const harness = createMechanismHarness();
    service = harness.service;
    internals = service as unknown as FirstRunInternals;
    track = vi.spyOn(harness.injector.get(AnalyticsService), 'track');
    service.arrived();
  });

  it('reports the first run once a visit, even when a later run is a different machine', () => {
    rebuildRunning(true);
    rebuildRunning(false);
    rebuildRunning(true);

    const runs = track.mock.calls.filter(([name]) => name === 'mechanism_runs');
    expect(runs.length).toBe(1);
  });
});
