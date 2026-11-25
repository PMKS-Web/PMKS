import type { MockInstance } from 'vitest';
import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { RevJoint } from '../model/joint';
import { AnalyticsService } from './analytics.service';
import { MechanismService } from './mechanism.service';

/** The private pieces of the first-run report this spec drives, named once. */
interface FirstRunInternals {
  mechanisms: { isMechanismValid: () => boolean }[];
  partitions: { id: string; ownJoints: RevJoint[] }[];
  solvingDeferred: boolean;
}

/**
 * `mechanism_runs`: the moment a student's own build first works.
 *
 * Machines are stood in for by stubs: the report asks only which machines are
 * valid and what each one's key is, and the family lookup falls back to "Not
 * recognized" for a stub, which is the case it is written to survive.
 */
describe('MechanismService mechanism_runs report', () => {
  let service: MechanismService;
  let internals: FirstRunInternals;
  let track: MockInstance<AnalyticsService['track']>;

  /**
   * The drawing after a rebuild: one entry per machine, named by its moving
   * joints ("BC" is a machine made of B and C).
   */
  function machines(...running: [joints: string, runs: boolean][]): void {
    internals.partitions = running.map(([joints]) => ({
      id: joints,
      ownJoints: [...joints].map((id) => new RevJoint(id, 0, 0)),
    }));
    internals.mechanisms = running.map(([, runs]) => ({ isMechanismValid: () => runs }));
  }

  function reports(): number {
    return track.mock.calls.filter(([name]) => name === 'mechanism_runs').length;
  }

  beforeEach(() => {
    const harness = createMechanismHarness();
    service = harness.service;
    internals = service as unknown as FirstRunInternals;
    track = vi.spyOn(harness.injector.get(AnalyticsService), 'track');
    machines();
    service.arrived();
  });

  it('reports a saved edit that makes something run, including a drag that saves directly', () => {
    machines(['B', false]);
    service.save();
    expect(reports()).toBe(0);

    machines(['B', true]);
    service.save();
    expect(reports()).toBe(1);
  });

  it('reports once a visit, even when a later run is a different machine', () => {
    machines(['B', true]);
    service.save();
    machines(['B', false]);
    service.save();
    machines(['E', true]);
    service.save();

    expect(reports()).toBe(1);
  });

  it('does not credit the reader with a template that arrived running', () => {
    machines(['B', true]);
    service.arrived();
    service.save();

    expect(reports()).toBe(0);
  });

  it('counts a machine the reader builds beside a template that already runs', () => {
    machines(['B', true]);
    service.arrived();

    machines(['B', true], ['G', true]);
    service.save();

    expect(reports()).toBe(1);
  });

  /** Stand in for `solveNow`'s rebuild: the solve happens and these machines result. */
  function solveTo(...running: [key: string, runs: boolean][]): void {
    vi.spyOn(service, 'updateMechanism').mockImplementation(() => {
      internals.solvingDeferred = false;
      machines(...running);
    });
    service.solveNow();
  }

  it('asks about an edit saved while the solve was put off once the solve happens', () => {
    internals.solvingDeferred = true;
    service.save();
    expect(reports()).toBe(0);

    solveTo(['B', true]);
    expect(reports()).toBe(1);
  });

  it('takes the first solve of a large drawing that arrived running as the starting point', () => {
    internals.solvingDeferred = true;
    service.arrived();

    solveTo(['B', true]);
    service.save();

    expect(reports()).toBe(0);
  });

  it('does not count a running machine as new when a tracer gives it an earlier letter', () => {
    machines(['GH', true]);
    service.arrived();

    // A tracer lettered A joins G and H: the machine's lowest letter changes,
    // and it is still the machine that arrived running.
    machines(['AGH', true]);
    service.save();

    expect(reports()).toBe(0);
  });
});
