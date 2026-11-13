// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { PrisJoint, RevJoint } from '../../app/model/joint';
import { Link } from '../../app/model/link';
import { PositionSolver } from '../../app/model/mechanism/position-solver';

/**
 * A block at the end of its slot is a bound the mechanism reached, not a
 * dead center.
 *
 * The walk tells the two apart by `refusalKind`: only `'unsolved'` lets a
 * slider-driven crank try to carry on through, so a slot stop reported as
 * `'unsolved'` would send the step looking for another root at the stop
 * instead of retracing, as every other reached bound does.
 */
const solver = PositionSolver as unknown as {
  ridersAreInTheirSlots: (joints: unknown[]) => boolean;
  refusalKind: string;
  jointMapPositions: Map<string, number[]>;
  carryPast: Map<string, number[]> | undefined;
  resetStaticVariables: () => void;
};

describe('a rider at the end of its slot', () => {
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 10, 0);
  const rider = new PrisJoint('P', 5, 0);
  rider.slideOn({} as Link, a, b);

  beforeEach(() => {
    solver.resetStaticVariables();
    solver.refusalKind = 'unsolved';
  });

  const placeRiderAt = (x: number) => {
    solver.jointMapPositions = new Map([
      ['A', [0, 0]],
      ['B', [10, 0]],
      ['P', [x, 0]],
    ]);
  };

  it('is accepted while it is inside the slot', () => {
    placeRiderAt(5);
    expect(solver.ridersAreInTheirSlots([a, b, rider])).toBe(true);
  });

  it('is refused as travel once it is past the end', () => {
    placeRiderAt(30);
    expect(solver.ridersAreInTheirSlots([a, b, rider])).toBe(false);
    expect(solver.refusalKind).toBe('travel');
  });
});

describe('the carry the walk asks for at a reversal', () => {
  it('does not outlive a solver reset', () => {
    solver.carryPast = new Map([['A', [0, 0]]]);
    solver.resetStaticVariables();
    expect(solver.carryPast).toBeUndefined();
  });
});
