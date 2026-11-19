// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here (see test-utils/verification/fixture.ts).
import '../../app/model/joint';
import { buildMechanism, MechanismFixture } from '../../test-utils/verification/fixture';
import {
  fourBarInversionsFixture,
  sliderCrankInversionsFixture,
} from '../../test-utils/verification/inversion-fixtures';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { Mechanism } from '../../app/model/mechanism/mechanism';

/**
 * One chain, held by a different link each time.
 *
 * What each drawing has to prove is not only that it solves but that it is the
 * mechanism the table beside it claims: that holding the shortest bar really
 * does give a double crank and holding the one opposite it really does give a
 * double rocker. That is asked of the solved motion rather than of the Grashof
 * arithmetic that predicted it — which bars actually go right over, and which
 * only rock — so the drawing is checked against the theory rather than the
 * theory against itself.
 */

/** Every machine the drawing comes apart into, solved on its own. */
function machines(fixture: MechanismFixture): Mechanism[] {
  const built = buildMechanism(fixture);
  const partitioning = partitionMechanisms(built.joints, built.links, built.forces);
  expect(partitioning.unassigned.looseJoints.length).toBe(0);
  return partitioning.mechanisms.map(
    (partition) =>
      new Mechanism(
        partition.joints,
        partition.links,
        partition.forces,
        [],
        false,
        'cm',
        fixture.inputAngVel,
        'adaptive',
        new Set(partition.ownJoints.map((joint) => joint.id))
      )
  );
}

function expectSeparateMachines(fixture: MechanismFixture, count: number): Mechanism[] {
  const solved = machines(fixture);
  expect(solved.length).toBe(count);
  solved.forEach((machine) => {
    expect(machine.dof).toBe(1);
    expect(machine.isMechanismValid()).toBe(true);
  });
  return solved;
}

/** Every link's mass, blocks and welded members included. */
function masses(fixture: MechanismFixture): number[] {
  return buildMechanism(fixture).links.map((link) => link.mass);
}

/**
 * Does this bar go right over, or does it swing and come back?
 *
 * Asked of the solved cycle rather than of the lengths, so it is a statement
 * about the mechanism the template actually opens and not about the Grashof
 * arithmetic that predicted it. The angles a full rotation visits are spread
 * all the way round with no gap between neighboring samples; a rocker leaves
 * the whole of the rest of the circle empty, so the widest gap separates the
 * two cleanly with nothing near the boundary.
 */
function goesOver(machine: Mechanism, pivot: string, tip: string): boolean {
  const angles = machine.joints
    .map((frame) => {
      const at = frame.find((joint) => joint.id === pivot)!;
      const end = frame.find((joint) => joint.id === tip)!;
      return (Math.atan2(end.y - at.y, end.x - at.x) + 2 * Math.PI) % (2 * Math.PI);
    })
    .sort((one, other) => one - other);
  const gaps = angles.map((angle, index) =>
    index === 0 ? angles[0] + 2 * Math.PI - angles[angles.length - 1] : angle - angles[index - 1]
  );
  return Math.max(...gaps) < Math.PI / 6;
}

/** The lengths a machine's named bars are drawn at, rounded to the drawing. */
function spans(machine: Mechanism, pairs: [string, string][]): number[] {
  const frame = machine.joints[0];
  return pairs.map(([from, to]) => {
    const a = frame.find((joint) => joint.id === from)!;
    const b = frame.find((joint) => joint.id === to)!;
    return Math.round(Math.hypot(a.x - b.x, a.y - b.y) * 100) / 100;
  });
}

describe('one four-bar chain, each link held still in turn', () => {
  it('comes apart into four machines, every one of them playable', () => {
    expectSeparateMachines(fourBarInversionsFixture(), 4);
  });

  it('is the same four bars every time', () => {
    // The lengths are what make this one chain rather than four linkages drawn
    // together, and they are the premise of every claim below — so they are
    // measured rather than trusted. Every inversion draws all four, the held
    // one included, so there are four spans to read and no frame to infer.
    const [heldL4, heldL2, heldL1, heldL3] = machines(fourBarInversionsFixture());
    const chain = [1, 2, 2.5, 3];
    expect(
      spans(heldL4, [
        ['A', 'B'],
        ['B', 'C'],
        ['C', 'D'],
        ['A', 'D'],
      ]).sort()
    ).toEqual(chain);
    expect(
      spans(heldL2, [
        ['E', 'F'],
        ['F', 'G'],
        ['G', 'H'],
        ['E', 'H'],
      ]).sort()
    ).toEqual(chain);
    expect(
      spans(heldL1, [
        ['I', 'J'],
        ['J', 'K'],
        ['K', 'L'],
        ['I', 'L'],
      ]).sort()
    ).toEqual(chain);
    expect(
      spans(heldL3, [
        ['M', 'N'],
        ['N', 'O'],
        ['O', 'P'],
        ['M', 'P'],
      ]).sort()
    ).toEqual(chain);
  });

  it('names each bar the same in all four, and keeps the chain in order', () => {
    // Sorted spans prove four drawings of one set of lengths; this proves they
    // are one chain, and that a name means one bar. L1 is 1 long, L2 2, L3 3
    // and L4 2.5 wherever each turns up, and going round every loop the names
    // come in cyclic order, L1 beside L2 and L4 and never opposite either.
    const fixture = fourBarInversionsFixture();
    const at = (id: string) => fixture.joints.find((joint) => joint.id === id)!;
    const length = { L1: 1, L2: 2, L3: 3, L4: 2.5 } as Record<string, number>;
    fixture.links.forEach((link) => {
      const [a, b] = [...link.joints].map(at);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeCloseTo(length[link.name!], 9);
    });
    for (const letters of ['ABCD', 'EFGH', 'IJKL', 'MNOP']) {
      const loop = [...letters].map((id, index) => {
        const next = letters[(index + 1) % 4];
        return fixture.links.find((link) => link.joints === id + next || link.joints === next + id)!
          .name!;
      });
      const order = loop.map((name) => Number(name.slice(1)));
      const steps = order.map((n, index) => (order[(index + 1) % 4] - n + 4) % 4);
      expect(steps.every((step) => step === 1) || steps.every((step) => step === 3)).toBe(true);
    }
  });

  it('is a different mechanism each time, which is the whole point', () => {
    const [heldL4, heldL2, heldL1, heldL3] = machines(fourBarInversionsFixture());

    // Holding a bar beside the shortest: the shortest cranks, the far bar rocks.
    expect(goesOver(heldL4, 'A', 'B')).toBe(true);
    expect(goesOver(heldL4, 'D', 'C')).toBe(false);
    expect(goesOver(heldL2, 'E', 'F')).toBe(true);
    expect(goesOver(heldL2, 'H', 'G')).toBe(false);

    // Holding the shortest itself: both bars pinned to the frame go over.
    expect(goesOver(heldL1, 'I', 'J')).toBe(true);
    expect(goesOver(heldL1, 'L', 'K')).toBe(true);

    // Holding the bar opposite the shortest, which is now the coupler: nothing
    // pinned to the frame can get round at all.
    expect(goesOver(heldL3, 'M', 'N')).toBe(false);
    expect(goesOver(heldL3, 'P', 'O')).toBe(false);
  });

  it('carries no mass, being about motion', () => {
    expect(masses(fourBarInversionsFixture()).every((mass) => mass === 0)).toBe(true);
  });
});

describe('one slider-crank chain, each link held still in turn', () => {
  it('comes apart into four machines, every one of them playable', () => {
    expectSeparateMachines(sliderCrankInversionsFixture(), 4);
  });

  it('is the same crank and rod every time', () => {
    const [engine, whitworth, cylinder, pump] = machines(sliderCrankInversionsFixture());
    // L2 is 1.2 and L3 is 2.6 in all four, whichever of them is held and
    // whichever is doing the turning.
    expect(spans(engine, [['A', 'B']])).toEqual([1.2]);
    expect(spans(engine, [['B', 'C']])).toEqual([2.6]);
    expect(spans(whitworth, [['E', 'F']])).toEqual([1.2]);
    expect(spans(whitworth, [['F', 'G']])).toEqual([2.6]);
    expect(spans(cylinder, [['I', 'J']])).toEqual([1.2]);
    expect(spans(cylinder, [['I', 'K']])).toEqual([2.6]);
    expect(spans(pump, [['P', 'Q']])).toEqual([1.2]);
    expect(spans(pump, [['O', 'P']])).toEqual([2.6]);
  });

  it('names each link by the joints it carries, so a link is the same link in all four', () => {
    // L1 carries the crankshaft pin and the slide, L2 the crankshaft and crank
    // pins, L3 the crank and gudgeon pins, L4 the gudgeon pin and the slide.
    // The cylinder of the oscillating engine is L4 and its piston rod L1 —
    // the piston of the ordinary engine and its frame — which is the thing
    // most easily drawn backwards.
    const fixture = sliderCrankInversionsFixture();
    const named = (name: string) =>
      fixture.links.filter((link) => link.name === name).map((link) => link.joints);
    expect(named('L1')).toEqual(['AD', 'EH', 'JN', 'QR']);
    expect(named('L2')).toEqual(['AB', 'EF', 'IJ', 'PQ']);
    expect(named('L3')).toEqual(['BC', 'FG', 'IK', 'OP']);
    expect(named('L4')).toEqual(['KLM', 'ST']);
    // The slide is between L1 and L4 every time: the block on L1's rail or
    // slot in the first two, L4's sleeve on L1's slot in the third, and L1's
    // rod in L4's barrel in the fourth.
    const carrier = (at: string) =>
      fixture.links.find(
        (link) => link.joints === fixture.sliders!.find((s) => s.at === at)!.on!.carrier
      )!.name;
    expect(['C', 'G', 'L', 'M', 'R'].map(carrier)).toEqual(['L1', 'L1', 'L1', 'L1', 'L4']);
  });

  it('holds a different link still each time, and draws it', () => {
    const fixture = sliderCrankInversionsFixture();
    const grounded = (id: string) => fixture.joints.find((joint) => joint.id === id)!.ground;
    const held = fixture.links.filter((link) => [...link.joints].every(grounded));
    expect(held.map((link) => link.name)).toEqual(['L1', 'L2', 'L3', 'L4']);
  });

  it('turns the slotted bar right over for one and rocks the cylinder for the other', () => {
    // The claim that separates the second inversion from the third. Held by
    // the short crank, the slotted bar's pivot falls inside the circle the
    // block runs on and the bar goes over; held by the long rod, the trunnion
    // is outside the crank pin's circle and the cylinder only rocks.
    const [engine, whitworth, cylinder] = machines(sliderCrankInversionsFixture());
    expect(goesOver(engine, 'A', 'B')).toBe(true);
    expect(goesOver(whitworth, 'F', 'G')).toBe(true);
    expect(goesOver(whitworth, 'E', 'H')).toBe(true);
    expect(goesOver(cylinder, 'I', 'J')).toBe(true);
    expect(goesOver(cylinder, 'K', 'M')).toBe(false);
  });

  it('keeps the piston rod in line with the rocking cylinder', () => {
    const [, , cylinder] = machines(sliderCrankInversionsFixture());
    const heading = (frame: { id: string; x: number; y: number }[], from: string, to: string) => {
      const a = frame.find((joint) => joint.id === from)!;
      const b = frame.find((joint) => joint.id === to)!;
      return Math.atan2(b.y - a.y, b.x - a.x);
    };
    cylinder.joints.forEach((frame) => {
      const skew = heading(frame, 'J', 'N') - heading(frame, 'L', 'M');
      expect(Math.abs(Math.sin(skew))).toBeLessThan(1e-6);
    });
  });

  it('swings the pump pendulum and runs the pump rod straight up and down', () => {
    const [, , , pump] = machines(sliderCrankInversionsFixture());
    expect(goesOver(pump, 'O', 'P')).toBe(false);
    const xs = pump.joints.flatMap((frame) =>
      frame.filter((joint) => joint.id === 'Q' || joint.id === 'R').map((joint) => joint.x)
    );
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(1e-6);
    const tops = pump.joints.map((frame) => frame.find((joint) => joint.id === 'Q')!.y);
    expect(Math.max(...tops) - Math.min(...tops)).toBeGreaterThan(1);
  });

  it('carries no mass, being about motion', () => {
    expect(masses(sliderCrankInversionsFixture()).every((mass) => mass === 0)).toBe(true);
  });
});
