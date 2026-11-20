// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import { RATE_TOLERANCE, velocityAgreesWithPositions } from '../../test-utils/verification/rates';
import { solveDynamics, solveKinematics } from '../../test-utils/verification/solve';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { frameFirstLoneCrankFixture } from '../../test-utils/verification/mobility-fixtures';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { KinematicsSolver } from '../../app/model/mechanism/kinematic-solver';

/**
 * A four-bar whose frame bar was drawn before its crank.
 *
 * Students draw the frame the way a textbook does, and often first. The
 * position solver learned to ask the actuator which body the input turns
 * rather than taking the pivot's first link, so this drawing animates; the
 * rate solver went on taking the first link, made the *frame* the input body,
 * and reported no angular velocity for the crank, zero for the coupler and
 * rocker, and NaN joint velocities. Every reading in Kinematic Analysis was
 * wrong while the animation looked right.
 */
function fourBar(order: string[]): MechanismFixture {
  const S = MODEL_SCALE;
  return {
    joints: [
      { id: 'A', x: 0, y: 0, ground: true, input: true },
      { id: 'B', x: 1 * S, y: 2 * S },
      { id: 'C', x: 4 * S, y: 3 * S },
      { id: 'D', x: 4 * S, y: 0, ground: true },
    ],
    links: order.map((joints) => ({ joints })),
    inputAngVel: 1,
  };
}

const FRAME_FIRST = ['AD', 'AB', 'BC', 'CD'];
const CRANK_FIRST = ['AB', 'BC', 'CD', 'AD'];

describe('a four-bar whose frame was drawn before its crank', () => {
  it('moves at the rate its positions imply', () => {
    const agreement = velocityAgreesWithPositions(buildMechanism(fourBar(FRAME_FIRST)));

    expect(agreement.unsolved).toEqual([]);
    expect(agreement.stationary).toEqual([]);
    expect(agreement.compared).toBeGreaterThan(100);
    expect(agreement.worst).toBeLessThan(RATE_TOLERANCE);
  });

  it('reads the same rates as the crank-first drawing of the same linkage', () => {
    const frameFirst = solveKinematics(buildMechanism(fourBar(FRAME_FIRST)));
    const crankFirst = solveKinematics(buildMechanism(fourBar(CRANK_FIRST)));
    expect(frameFirst.steps).toBe(crankFirst.steps);

    for (const step of [0, Math.floor(frameFirst.steps / 3), frameFirst.steps - 1]) {
      for (const link of ['AB', 'BC', 'CD']) {
        expect(frameFirst.linkAngVel[step][link], `${link} ω at ${step}`).toBeCloseTo(
          crankFirst.linkAngVel[step][link],
          6
        );
        expect(frameFirst.linkAngAcc[step][link], `${link} α at ${step}`).toBeCloseTo(
          crankFirst.linkAngAcc[step][link],
          6
        );
      }
      for (const joint of ['B', 'C']) {
        const [vx, vy] = frameFirst.jointVel[step][joint];
        const [ux, uy] = crankFirst.jointVel[step][joint];
        expect(vx, `${joint} vx at ${step}`).toBeCloseTo(ux, 6);
        expect(vy, `${joint} vy at ${step}`).toBeCloseTo(uy, 6);
      }
    }
  });

  it('needs the same input torque as the crank-first drawing', () => {
    const frameFirst = solveDynamics(buildMechanism(fourBar(FRAME_FIRST)));
    const crankFirst = solveDynamics(buildMechanism(fourBar(CRANK_FIRST)));
    expect(frameFirst.steps).toBe(crankFirst.steps);

    for (let step = 0; step < frameFirst.steps; step += 7) {
      expect(frameFirst.torque[step], `torque at ${step}`).toBeCloseTo(crankFirst.torque[step], 6);
    }
  });
});

describe('a lone crank whose frame was drawn before it', () => {
  it('gives the crank and its free joint their rates, with no loop to solve', () => {
    // The loopless path took the pivot's first link, the frame plate, so B
    // had no velocity and the crank no CoM rate (#336). Partitioned as the
    // app does it, so the frame plate stays first.
    const built = buildMechanism(frameFirstLoneCrankFixture());
    const [partition] = partitionMechanisms(built.joints, built.links, built.forces).mechanisms;
    expect(partition.links[0].id).toBe('ACE');
    const mechanism = new Mechanism(
      partition.joints,
      partition.links,
      partition.forces,
      [],
      false,
      'cm',
      1,
      'adaptive',
      new Set(partition.ownJoints.map((joint) => joint.id))
    );
    expect(mechanism.requiredLoops.length).toBe(0);
    KinematicsSolver.resetVariables();
    KinematicsSolver.requiredLoops = mechanism.requiredLoops;
    KinematicsSolver.determineKinematics(
      mechanism.joints[0],
      mechanism.links[0],
      mechanism.inputAngularVelocities[0]
    );
    expect(KinematicsSolver.jointVelMap.get('B')?.every(Number.isFinite)).toBe(true);
    expect(KinematicsSolver.linkVelMap.get('AB')?.every(Number.isFinite)).toBe(true);
  });
});
