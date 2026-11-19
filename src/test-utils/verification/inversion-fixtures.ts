import { MechanismFixture } from './fixture';

/**
 * One chain, held by a different link each time.
 *
 * Inversion is the first surprising thing anybody is taught about mechanisms:
 * that a four-bar and a drag link are the same four bars, and that an engine
 * and a Whitworth quick-return are the same four parts of a slider-crank. It
 * is a claim about four drawings, so it takes four drawings to make — which is
 * what these two are.
 *
 * The link being held is drawn in both sets rather than left as bare ground
 * pins. It is what the drawing is *about*, and a picture that omits it asks
 * the reader to work out which bar is missing.
 */

/** A cycle in six seconds at 1x, the pace the rest of the library opens at. */
const LIBRARY_RPM = 10;
const radPerSecond = (rpm: number) => (rpm * Math.PI) / 30;

interface Point {
  x: number;
  y: number;
}

const along = (from: Point, direction: Point, distance: number): Point => ({
  x: from.x + direction.x * distance,
  y: from.y + direction.y * distance,
});

const unit = (from: Point, to: Point): Point => {
  const span = Math.hypot(to.x - from.x, to.y - from.y);
  return { x: (to.x - from.x) / span, y: (to.y - from.y) / span };
};

const turned = (radius: number, degrees: number): Point => ({
  x: radius * Math.cos((degrees * Math.PI) / 180),
  y: radius * Math.sin((degrees * Math.PI) / 180),
});

/**
 * Where two circles cross, which is where a four-bar's coupler pin lands.
 *
 * `branch` picks which of the two crossings — the same chain assembles two
 * ways, and taking the wrong one is a mechanism that runs through a mirror
 * image of the motion it was drawn for.
 */
function meet(a: Point, ra: number, b: Point, rb: number, branch: 1 | -1): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d > ra + rb || d < Math.abs(ra - rb)) {
    throw new Error(`meet: circles ${ra} and ${rb} do not reach across ${d.toFixed(3)}`);
  }
  const reach = (ra * ra - rb * rb + d * d) / (2 * d);
  const across = Math.sqrt(Math.max(0, ra * ra - reach * reach));
  return {
    x: a.x + (reach * dx - branch * across * dy) / d,
    y: a.y + (reach * dy + branch * across * dx) / d,
  };
}

/** Every machine in one drawing, as one fixture. */
function merge(parts: MechanismFixture[], inputAngVel: number): MechanismFixture {
  return {
    joints: parts.flatMap((part) => part.joints),
    links: parts.flatMap((part) => part.links),
    sliders: parts.flatMap((part) => part.sliders ?? []),
    welds: parts.flatMap((part) => part.welds ?? []),
    inputAngVel,
  };
}

/**
 * The four-bar chain, and the four mechanisms it is.
 *
 * The bars are 1, 2, 3 and 2.5 long in that cyclic order, which satisfies
 * Grashof strictly (1 + 3 < 2 + 2.5) — so what each inversion turns out to be is
 * decided by where the shortest bar sits relative to the one being held:
 *
 * | Held | The shortest is | What it becomes |
 * | --- | --- | --- |
 * | L4 | beside the frame | crank-rocker |
 * | L2 | beside the frame | crank-rocker, the other one |
 * | L1 (the shortest) | the frame | double crank — both grounded bars go over |
 * | L3 (opposite L1) | the coupler | double rocker — neither grounded bar goes over |
 *
 * In that order, which is the order Norton and Shigley/Uicker draw them in.
 *
 * In the double rocker the coupler, being the shortest, can still turn right
 * round relative to the others — but only by passing through the two toggle
 * positions, where it lies in line with a rocker. Driven from a rocker, as
 * here, the input stops and reverses at those two positions instead.
 *
 * The held bar is drawn, pinned to ground at both ends. It cannot move and the
 * app knows it — a bar anchored twice is counted as part of the frame rather
 * than as a body, so drawing it costs the mechanism no degree of freedom (see
 * anchored-bar-mobility.spec.ts). That is what lets all four bars appear in
 * every one of the four, with only the ground hatching moving.
 *
 * Colors and names carry a bar's identity between the four, which is the
 * point the drawing exists to make: L2 is the same bar whether it is a crank,
 * a coupler or the frame. They are pinned in template-colors.ts.
 */
export function fourBarInversionsFixture(): MechanismFixture {
  const L1 = 1;
  const L2 = 2;
  const L3 = 3;
  const L4 = 2.5;

  const inversions: {
    letters: string;
    /** The held bar, spanning the two ground pins. */
    frame: number;
    /** Then round the loop from the left pin: crank, coupler, rocker. */
    crank: number;
    coupler: number;
    rocker: number;
    /** Which bar of the chain each of those four is. */
    names: [string, string, string, string];
    theta: number;
    branch: 1 | -1;
    at: Point;
  }[] = [
    // Held: L4. The shortest is beside it and cranks; the far bar rocks.
    {
      letters: 'ABCD',
      frame: L4,
      crank: L1,
      coupler: L2,
      rocker: L3,
      names: ['L1', 'L2', 'L3', 'L4'],
      // Low enough that the crank and coupler are visibly two bars rather
      // than one side of a triangle.
      theta: 30,
      branch: 1,
      at: { x: 0, y: 6 },
    },
    // Held: L2. The other bar beside the shortest, so the other crank-rocker.
    {
      letters: 'EFGH',
      frame: L2,
      crank: L1,
      coupler: L4,
      rocker: L3,
      names: ['L1', 'L4', 'L3', 'L2'],
      theta: 30,
      branch: 1,
      at: { x: 9, y: 6 },
    },
    // Held: L1, the shortest. Both bars pinned to the frame go right over.
    {
      letters: 'IJKL',
      frame: L1,
      crank: L2,
      coupler: L3,
      rocker: L4,
      names: ['L2', 'L3', 'L4', 'L1'],
      theta: 100,
      branch: 1,
      at: { x: 0, y: 0 },
    },
    // Held: L3, opposite the shortest, which is now the coupler. Nothing
    // pinned to the frame can get round at all.
    {
      letters: 'MNOP',
      frame: L3,
      crank: L2,
      coupler: L1,
      rocker: L4,
      names: ['L2', 'L1', 'L4', 'L3'],
      // Partway up the input's swing, which is 26° to 86°, where neither
      // joint of the coupler is near straight.
      theta: 70,
      branch: 1,
      at: { x: 9, y: 0 },
    },
  ];

  const parts: MechanismFixture[] = inversions.map((one) => {
    const [first, second, third, fourth] = [...one.letters];
    const pivot = one.at;
    const far = { x: one.at.x + one.frame, y: one.at.y };
    const elbow = along(pivot, turned(1, one.theta), one.crank);
    const wrist = meet(elbow, one.coupler, far, one.rocker, one.branch);
    return {
      joints: [
        // The left pin drives. For every inversion but the double rocker that
        // is a bar which goes right over. In the double rocker neither bar on
        // the frame does, so the drive swings it between the two toggle
        // points, where the coupler lies in line with the far rocker, and
        // reverses there.
        { id: first, ...pivot, ground: true, input: true, driveSpeed: LIBRARY_RPM },
        { id: second, ...elbow },
        { id: third, ...wrist },
        { id: fourth, ...far, ground: true },
      ],
      links: [
        { joints: first + second, name: one.names[0], mass: 0, moi: 0 },
        { joints: second + third, name: one.names[1], mass: 0, moi: 0 },
        { joints: third + fourth, name: one.names[2], mass: 0, moi: 0 },
        // The held bar, across the two ground pins.
        { joints: first + fourth, name: one.names[3], mass: 0, moi: 0 },
      ],
      inputAngVel: radPerSecond(LIBRARY_RPM),
    };
  });

  return merge(parts, radPerSecond(LIBRARY_RPM));
}

/**
 * The single-slider-crank chain, and the four mechanisms it is.
 *
 * Four links again, but one of the four pairs slides rather than turns, and
 * that is what makes this set worth drawing beside the four-bar: the same
 * operation on a chain with a slider in it produces an engine, a quick-return,
 * an oscillating-cylinder engine and a pump.
 *
 * The links are named the way the textbooks number them, and each keeps its
 * name and color in all four:
 *
 * | Link | In the engine | Its joints |
 * | --- | --- | --- |
 * | L1 | the frame, with the cylinder in it | crankshaft pin, and the slide |
 * | L2 | the crank | crankshaft pin, crank pin |
 * | L3 | the connecting rod | crank pin, gudgeon pin |
 * | L4 | the piston | gudgeon pin, and the slide |
 *
 * A link is which of these it is by the joints it carries, not by what it
 * looks like in a given inversion, and that is the whole lesson: held by the
 * rod, the part that rocks on its trunnion is L4 — the cylinder of an
 * oscillating engine is the piston of the ordinary one — and the rod sliding
 * in it is L1.
 *
 * | Held | What it becomes | Where you have seen it |
 * | --- | --- | --- |
 * | L1, the frame | slider-crank | engine, compressor, reciprocating pump |
 * | L2, the crank | the slotted bar goes right round | Whitworth quick-return, rotary engine |
 * | L3, the conrod | the cylinder rocks on its trunnion | oscillating cylinder engine |
 * | L4, the piston | the frame slides up and down over it | pendulum pump, hand pump |
 *
 * One chain throughout: L2 is 1.2 long and L3 is 2.6 in all four, with no
 * offset, and the slide is between L1 and L4 in all four. What changes is
 * which link is held.
 *
 * The held link is drawn in every one, the way the four-bar set draws its
 * held bar: the frame as the rail the piston runs on, anchored at both ends;
 * the crank and the rod as bars across their two ground pins; and the piston,
 * in the pump, as the barrel the pump rod runs in, below the pin the pendulum
 * hangs from. Where L4 is a block it is drawn as one, black; where it is a
 * part of its own it is dark teal, the color L4 wears in the four-bar set.
 *
 * Laid out two by two with room between, since the Whitworth's slotted bar
 * sweeps a circle ROD + CRANK across and the other three reach up or down
 * further than they reach sideways.
 */
export function sliderCrankInversionsFixture(): MechanismFixture {
  /** The crank, L2, and the connecting rod, L3. Both, in all four. */
  const CRANK = 1.2;
  const ROD = 2.6;

  // ---- Held: L1, the frame. The ordinary slider-crank. -------------------
  // The frame is drawn as the rail from the crankshaft out past the end of
  // the stroke, and the piston rides it: the piston runs between ROD - CRANK
  // and ROD + CRANK from the crankshaft.
  const engineAt = { x: 0, y: 9 };
  const engineElbow = along(engineAt, turned(1, 60), CRANK);
  const engine: MechanismFixture = {
    joints: [
      { id: 'A', ...engineAt, ground: true, input: true, driveSpeed: LIBRARY_RPM },
      { id: 'B', ...engineElbow },
      {
        id: 'C',
        // In line with the crank center, so the chain has no offset in any of
        // the four.
        x: engineElbow.x + Math.sqrt(ROD * ROD - (engineElbow.y - engineAt.y) ** 2),
        y: engineAt.y,
      },
      { id: 'D', x: engineAt.x + ROD + CRANK + 0.6, y: engineAt.y, ground: true },
    ],
    links: [
      { joints: 'AB', name: 'L2', mass: 0, moi: 0 },
      { joints: 'BC', name: 'L3', mass: 0, moi: 0 },
      { joints: 'AD', name: 'L1', mass: 0, moi: 0 },
    ],
    sliders: [{ at: 'C', on: { carrier: 'AD', a: 'A', b: 'D' } }],
    inputAngVel: radPerSecond(LIBRARY_RPM),
  };

  // ---- Held: L2, the crank. Whitworth quick-return. ----------------------
  // The crank's two pins are the ground pins now. The rod turns about the
  // crank pin, and the piston it carries slides along L1, which turns about
  // the crankshaft pin. That pin is the short crank's length from the other,
  // inside the circle the piston runs on, so L1 goes right over.
  const whitworthAt = { x: 10, y: 9 };
  const whitworthPivot = whitworthAt;
  const whitworthCenter = { x: whitworthAt.x + CRANK, y: whitworthAt.y };
  const whitworthBlock = along(whitworthCenter, turned(1, 60), ROD);
  const whitworth: MechanismFixture = {
    joints: [
      { id: 'E', ...whitworthPivot, ground: true },
      { id: 'F', ...whitworthCenter, ground: true, input: true, driveSpeed: LIBRARY_RPM },
      { id: 'G', ...whitworthBlock },
      {
        id: 'H',
        // Far enough out that the block never runs off the end: it travels
        // between ROD - CRANK and ROD + CRANK from the pivot.
        ...along(whitworthPivot, unit(whitworthPivot, whitworthBlock), ROD + CRANK + 0.4),
      },
    ],
    links: [
      { joints: 'FG', name: 'L3', mass: 0, moi: 0 },
      { joints: 'EH', name: 'L1', mass: 0, moi: 0 },
      { joints: 'EF', name: 'L2', mass: 0, moi: 0 },
    ],
    sliders: [{ at: 'G', on: { carrier: 'EH', a: 'E', b: 'H' } }],
    inputAngVel: radPerSecond(LIBRARY_RPM),
  };

  // ---- Held: L3, the conrod. Oscillating cylinder. -----------------------
  // The rod's two pins are the ground pins: the crankshaft below and the
  // trunnion above it. The crank turns about the lower one. L4, which was the
  // piston, is the cylinder now, rocking on the trunnion; L1, which was the
  // frame, is the piston rod, pinned to the crank and sliding through it.
  //
  // The cylinder is drawn as a short sleeve carrying two pins, one either
  // side of the trunnion, that ride a slot down the piston rod. Two pins on
  // one line hold the rod in line with the sleeve, which is what a piston in
  // its bore does; the app cannot yet solve a rod welded to a block sliding
  // in a slot that itself moves, so this is how the bore is drawn. The rod
  // reaches past the sleeve at both ends of the stroke: the crank pin is
  // between ROD - CRANK and ROD + CRANK from the trunnion.
  const cylinderAt = { x: 0, y: 0.5 };
  const trunnion = { x: cylinderAt.x, y: cylinderAt.y + ROD };
  const cylinderElbow = along(cylinderAt, turned(1, -30), CRANK);
  const bore = unit(cylinderElbow, trunnion);
  const SLEEVE = 0.45;
  const RAM = ROD + CRANK + SLEEVE + 0.5;
  const oscillating: MechanismFixture = {
    joints: [
      { id: 'I', ...cylinderAt, ground: true, input: true, driveSpeed: LIBRARY_RPM },
      { id: 'J', ...cylinderElbow },
      { id: 'K', ...trunnion, ground: true },
      { id: 'L', ...along(trunnion, bore, -SLEEVE) },
      { id: 'M', ...along(trunnion, bore, SLEEVE) },
      { id: 'N', ...along(cylinderElbow, bore, RAM) },
    ],
    links: [
      { joints: 'IJ', name: 'L2', mass: 0, moi: 0 },
      { joints: 'IK', name: 'L3', mass: 0, moi: 0 },
      { joints: 'KLM', name: 'L4', mass: 0, moi: 0 },
      { joints: 'JN', name: 'L1', mass: 0, moi: 0 },
    ],
    sliders: [
      { at: 'L', on: { carrier: 'JN', a: 'J', b: 'N' } },
      { at: 'M', on: { carrier: 'JN', a: 'J', b: 'N' } },
    ],
    inputAngVel: radPerSecond(LIBRARY_RPM),
  };

  // ---- Held: L4, the piston. Pendulum pump. ------------------------------
  // The piston's two features are fixed now: the gudgeon pin, at the top,
  // which the rod swings from like a pendulum, and the slide, which is the
  // pump's barrel below it on the same vertical line. The crank links the
  // pendulum to L1, the frame, which is the pump rod now, running up and
  // down in the barrel. The pendulum can swing only as far as the crank can
  // still reach the line, asin(CRANK / ROD) either side of it, and it is
  // driven between those two toggles.
  const pumpAt = { x: 10, y: 3.6 };
  const swing = (15 * Math.PI) / 180;
  const pendulumEnd = { x: pumpAt.x + ROD * Math.sin(swing), y: pumpAt.y - ROD * Math.cos(swing) };
  const rodTop = {
    x: pumpAt.x,
    y: pendulumEnd.y - Math.sqrt(CRANK * CRANK - (pendulumEnd.x - pumpAt.x) ** 2),
  };
  // The top of the pump rod stays between ROD cos(asin(CRANK / ROD)) and
  // ROD + CRANK below the pivot; the barrel takes the rod's lower end.
  const PUMP_ROD = 1.8;
  const pump: MechanismFixture = {
    joints: [
      { id: 'O', ...pumpAt, ground: true, input: true, driveSpeed: LIBRARY_RPM },
      { id: 'P', ...pendulumEnd },
      { id: 'Q', ...rodTop },
      { id: 'R', x: pumpAt.x, y: rodTop.y - PUMP_ROD },
      { id: 'S', x: pumpAt.x, y: pumpAt.y - ROD - CRANK - 0.1, ground: true },
      { id: 'T', x: pumpAt.x, y: pumpAt.y - ROD - CRANK - PUMP_ROD - 0.4, ground: true },
    ],
    links: [
      { joints: 'OP', name: 'L3', mass: 0, moi: 0 },
      { joints: 'PQ', name: 'L2', mass: 0, moi: 0 },
      { joints: 'QR', name: 'L1', mass: 0, moi: 0 },
      { joints: 'ST', name: 'L4', mass: 0, moi: 0 },
    ],
    sliders: [{ at: 'R', on: { carrier: 'ST', a: 'S', b: 'T' } }],
    welds: ['R'],
    inputAngVel: radPerSecond(LIBRARY_RPM),
  };

  return merge([engine, whitworth, oscillating, pump], radPerSecond(LIBRARY_RPM));
}
