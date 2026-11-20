// joint.ts first: the model modules form an import cycle that only
// initializes cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { Joint } from '../../app/model/joint';
import { MechanismFixture } from '../../test-utils/verification/fixture';
import { fixturePayload } from '../../test-utils/verification/fixture-payload';
import {
  squareRodPistonFixture,
  SQUARE_ROD_CRANK,
  SQUARE_ROD_OFFSET,
} from '../../test-utils/verification/slot-fixtures';
import { buildMechanismFixture } from '../fixtures/mechanism-fixtures';
import { Mechanism } from '../../app/model/mechanism/mechanism';

// A slider driving a crank through a rod reverses at each end of its stroke,
// where crank and rod lie in one line, and the crank turns on through that dead
// center on its momentum. The walk keeps the joints' motion history across a
// prismatic input's reversal for exactly that, but one step of history only
// sees past the dead center when the last sample happened to land within about
// a third of a step of it, so which drawings carried through and which swung
// back was down to where their samples fell -- and almost none carried.

/** A crank on a pivot `offset` above the guide, its rod's foot driven along the guide. */
function piston(offset: number, crank: number, rod: number, start: number): MechanismFixture {
  const pin = { x: crank * Math.cos(start), y: offset + crank * Math.sin(start) };
  return {
    joints: [
      { id: 'A', x: 0, y: offset, ground: true },
      { id: 'B', ...pin },
      { id: 'C', x: pin.x + Math.sqrt(rod * rod - pin.y * pin.y), y: 0 },
    ],
    links: [{ joints: 'AB' }, { joints: 'BC' }],
    sliders: [{ at: 'C', angleRad: 0, input: true }],
    inputAngVel: 1,
  };
}

function solve(fixture: MechanismFixture) {
  const url = fixturePayload(fixture, undefined, { unitsPerSecond: 1.5 });
  return buildMechanismFixture(url).mechanism;
}

/** How far the crank turned over the cycle, unwrapped, and how much of that went backwards. */
function crankTravel(frames: Joint[][]): { turns: number; backtrack: number } {
  const angle = (frame: Joint[]) => {
    const pivot = frame.find((joint) => joint.id === 'A')!;
    const pin = frame.find((joint) => joint.id === 'B')!;
    return Math.atan2(pin.y - pivot.y, pin.x - pivot.x);
  };
  let forward = 0;
  let backward = 0;
  for (let i = 1; i < frames.length; i++) {
    let delta = angle(frames[i]) - angle(frames[i - 1]);
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    if (delta > 0) forward += delta;
    else backward -= delta;
  }
  return {
    turns: Math.abs(forward - backward) / (2 * Math.PI),
    backtrack: Math.min(forward, backward) / Math.max(forward, backward),
  };
}

/** How many times the driven slider turns round over the cycle. */
function strokeReversals(frames: Joint[][]): number {
  let reversals = 0;
  let heading = 0;
  for (let i = 1; i < frames.length; i++) {
    const was = frames[i - 1].find((joint) => joint.id === 'C')!;
    const now = frames[i].find((joint) => joint.id === 'C')!;
    const sign = Math.sign(now.x - was.x);
    if (sign !== 0 && heading !== 0 && sign !== heading) reversals++;
    if (sign !== 0) heading = sign;
  }
  return reversals;
}

describe('a piston whose rod comes square to its guide', () => {
  const mechanism = solve(squareRodPistonFixture());
  const frames = mechanism.joints;

  it('runs, sampled finely enough to watch', () => {
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(frames.length).toBeGreaterThan(300);
  });

  it('turns its crank twice, one way, for one stroke out and one back', () => {
    const { turns, backtrack } = crankTravel(frames);
    expect(turns).toBeCloseTo(2, 2);
    expect(backtrack).toBe(0);
    expect(strokeReversals(frames)).toBe(2);
  });

  it('keeps every bar its length and the slider on its guide', () => {
    const scale = Math.hypot(frames[0][1].x - frames[0][0].x, frames[0][1].y - frames[0][0].y);
    const rod = ((SQUARE_ROD_OFFSET + SQUARE_ROD_CRANK) * scale) / SQUARE_ROD_CRANK;
    for (const frame of frames) {
      const [pivot, pin, foot] = ['A', 'B', 'C'].map((id) => frame.find((j) => j.id === id)!);
      expect(Math.hypot(pin.x - pivot.x, pin.y - pivot.y)).toBeCloseTo(scale, 6);
      expect(Math.hypot(foot.x - pin.x, foot.y - pin.y)).toBeCloseTo(rod, 6);
      expect(foot.y).toBeCloseTo(frames[0][2].y, 6);
    }
  });
});

describe('a piston carries its crank through the dead centers wherever it is drawn', () => {
  // Start angles clear of both dead centers by more than a sample or two.
  for (const startDeg of [20, 70, 120, 200, 250, 320]) {
    it(`in line with its guide, drawn at ${startDeg} degrees`, () => {
      const mechanism = solve(piston(0, 1, 3, (startDeg * Math.PI) / 180));
      expect(mechanism.isMechanismValid()).toBe(true);
      const { turns, backtrack } = crankTravel(mechanism.joints);
      expect(turns).toBeCloseTo(1, 2);
      expect(backtrack).toBe(0);
    });
  }

  for (const startDeg of [22.5, 67.5, 90, 135, 202.5, 270]) {
    it(`with its rod square to the guide once a turn, drawn at ${startDeg} degrees`, () => {
      const mechanism = solve(
        piston(SQUARE_ROD_OFFSET, SQUARE_ROD_CRANK, 3, (startDeg * Math.PI) / 180)
      );
      expect(mechanism.isMechanismValid()).toBe(true);
      const { turns, backtrack } = crankTravel(mechanism.joints);
      expect(turns).toBeCloseTo(2, 2);
      expect(backtrack).toBe(0);
    });
  }

  it('offset from its guide, with a long rod', () => {
    const mechanism = solve(piston(0.5, 1, 6, 2));
    expect(mechanism.isMechanismValid()).toBe(true);
    expect(crankTravel(mechanism.joints).turns).toBeCloseTo(1, 2);
  });
});

describe('a piston drawn beside a dead center', () => {
  // A walk that carries through no longer comes home over the ground it went
  // out on, and from a pose a step or two from a dead center the samples may
  // never land on the drawn pose again. That drawing is walked again the way
  // every slider-driven drawing used to be, retracing at the dead centers, so
  // it runs rather than being called a cycle that never closes.
  for (const startDeg of [0, 315, 337.5]) {
    it(`still runs, drawn at ${startDeg} degrees`, () => {
      const mechanism = solve(
        piston(SQUARE_ROD_OFFSET, SQUARE_ROD_CRANK, 3, (startDeg * Math.PI) / 180)
      );
      expect(mechanism.isMechanismValid()).toBe(true);
    });
  }
});

describe('a walk told not to carry', () => {
  // The second walk a drawing gets when a carried one never closes must
  // retrace at every dead center. Its motion history is still kept across the
  // reversal, so on its own it would pick the continuing branch wherever the
  // samples happened to fall, and a covered step was kept there unless it was
  // ruled out by name. Every walk here starts out told not to carry.
  beforeEach(() => {
    const walk = Mechanism.prototype as unknown as {
      findFullMovementPos: (...args: unknown[]) => void;
    };
    const original = walk.findFullMovementPos;
    vi.spyOn(walk, 'findFullMovementPos').mockImplementation(function (
      this: { carryRefused: boolean },
      ...args: unknown[]
    ) {
      this.carryRefused = true;
      return original.apply(this, args);
    });
  });

  afterEach(() => vi.restoreAllMocks());

  for (const [offset, crank, startDeg] of [
    [0, 1, 0],
    [0, 1, 180],
    [SQUARE_ROD_OFFSET, SQUARE_ROD_CRANK, 97.5],
  ]) {
    it(`runs and comes back the way it went, ${offset} off its guide at ${startDeg} degrees`, () => {
      const mechanism = solve(piston(offset, crank, 3, (startDeg * Math.PI) / 180));
      expect(mechanism.isMechanismValid()).toBe(true);
      expect(crankTravel(mechanism.joints).turns).toBeCloseTo(0, 2);
    });
  }
});
