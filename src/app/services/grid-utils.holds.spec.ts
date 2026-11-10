import '../model/joint';
import { Coord } from '../model/coord';
import { Force } from '../model/force';
import { RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { MODEL_SCALE } from '../model/render-scale';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { DragStateService } from './drag-state.service';
import { GridUtilsService } from './grid-utils.service';
import { MechanismService } from './mechanism.service';

/**
 * Every route that moves a joint lands in `dragJoint`, and a held bar has a
 * say there. These are the CAD rules at the service level: what a drag of a
 * joint on a held bar does to it, to the bar's other end, and to nothing
 * else -- and what the canvas is told when the holds would not let it go.
 */

const S = MODEL_SCALE;

/** A four-bar: ground A, crank AB, coupler BC, rocker CD, ground D. */
function fourBar(mechanism: MechanismService) {
  const a = new RevJoint('A', 0, 0, true, true);
  const b = new RevJoint('B', 0, 2 * S);
  const c = new RevJoint('C', 3 * S, 3 * S);
  const d = new RevJoint('D', 4 * S, 0, false, true);
  const ab = new RealLink('AB', [a, b], 1, 1);
  const bc = new RealLink('BC', [b, c], 1, 1);
  const cd = new RealLink('CD', [c, d], 1, 1);
  mechanism.joints = [a, b, c, d];
  mechanism.links = [ab, bc, cd];
  mechanism.forces = [];
  wireGraph(mechanism);
  mechanism.updateMechanism();
  return { a, b, c, d, ab, bc, cd };
}

const dist = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  Math.hypot(q.x - p.x, q.y - p.y);

describe('dragging against a held bar', () => {
  let service: MechanismService;
  let grid: GridUtilsService;

  beforeEach(() => {
    const harness = createMechanismHarness();
    service = harness.service;
    grid = harness.injector.get(GridUtilsService);
    // Under the pointer: a ground pin is an ordinary joint, and only a Lock
    // holds still.
    harness.injector.get(DragStateService).beginDraggingJoint();
  });

  it('slides the free end on the arc about a locked end when the length is held', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    parts.a.locked = true;
    grid.dragJoint(parts.b, new Coord(3 * S, 2 * S));
    expect(dist(parts.a, parts.b)).toBeCloseTo(2 * S, 3);
    // Nearest point of the arc to the ask, not the ask itself.
    expect(parts.b.x).toBeGreaterThan(0.5 * S);
    expect(grid.lastHoldRefusal).toBeUndefined();
    // The bar's own record of its length agrees with its joints.
    expect(parts.ab.length).toBeCloseTo(2 * S, 3);
  });

  it('swings a grounded end rather than stopping at it when the length is held', () => {
    // A ground pin is not a lock: B goes where it is dragged, and A is towed
    // along at the held length.
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    grid.dragJoint(parts.b, new Coord(3 * S, 2 * S));
    expect(parts.b.x).toBeCloseTo(3 * S, 2);
    expect(parts.b.y).toBeCloseTo(2 * S, 2);
    expect(dist(parts.a, parts.b)).toBeCloseTo(2 * S, 3);
    expect(parts.a.x).toBeGreaterThan(0.5 * S);
    expect(grid.lastHoldRefusal).toBeUndefined();
  });

  it('lets the grounded end be dragged, towing the free end at the held length', () => {
    // In Edit a ground pin drags like any other. A is asked to move; B, the
    // free end, comes along by however much the locked length needs.
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    expect(grid.holdsImmobilizing(parts.a)).toEqual([]);
    grid.dragJoint(parts.a, new Coord(1 * S, 0.5 * S));
    expect(parts.a.x).toBeCloseTo(1 * S, 2);
    expect(parts.a.y).toBeCloseTo(0.5 * S, 2);
    expect(dist(parts.a, parts.b)).toBeCloseTo(2 * S, 3);
    expect(grid.lastHoldRefusal).toBeUndefined();
  });

  it('keeps the free end on the line through a locked end when the angle is held', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'angle';
    parts.a.locked = true;
    grid.dragJoint(parts.b, new Coord(1 * S, 3 * S));
    // The bar points straight up: B stays on x = 0, at the height asked.
    expect(parts.b.x).toBeCloseTo(0, 3);
    expect(parts.b.y).toBeCloseTo(3 * S, 3);
  });

  it('tows the far end along when it is free, and leaves the rest alone', () => {
    const parts = fourBar(service);
    parts.bc.hold = 'length';
    const before = dist(parts.b, parts.c);
    const dWas = { x: parts.d.x, y: parts.d.y };
    grid.dragJoint(parts.c, new Coord(6 * S, 3 * S));
    expect(parts.c.x).toBeCloseTo(6 * S, 2);
    expect(dist(parts.b, parts.c)).toBeCloseTo(before, 3);
    expect(parts.b.x).toBeGreaterThan(0);
    expect(parts.d).toMatchObject(dWas);
  });

  it('refuses a joint the holds have fully determined, naming them', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    parts.bc.hold = 'length';
    parts.a.locked = true;
    parts.c.locked = true;
    const bWas = { x: parts.b.x, y: parts.b.y };
    expect(grid.holdsImmobilizing(parts.b).map((bar) => bar.id)).toEqual(['AB', 'BC']);
    grid.dragJoint(parts.b, new Coord(2 * S, 2 * S));
    expect(parts.b.x).toBeCloseTo(bWas.x, 3);
    expect(parts.b.y).toBeCloseTo(bWas.y, 3);
    expect(grid.lastHoldRefusal?.immovable.map((joint) => joint.id)).toEqual(['B']);
  });

  it('moves a whole body through the holds when one of its joints is held', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    // Dragging the coupler carries B and C; B may only ride the arc about A.
    const length = dist(parts.b, parts.c);
    grid.dragLink(parts.bc, 2 * S, 0);
    expect(dist(parts.a, parts.b)).toBeCloseTo(2 * S, 3);
    expect(dist(parts.b, parts.c)).toBeCloseTo(length, 3);
    expect(parts.c.x).toBeGreaterThan(3 * S);
  });

  it('swings a held crank about its ground pin when the coupler is dragged', () => {
    // #261: with AB holding its length and A only grounded, dragging BC moves
    // A too. The coupler stays rigid and reaches the pointer.
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    const start = service.joints.map(({ id, x, y }) => ({ id, x, y }));
    const length = dist(parts.b, parts.c);
    const target = new Coord(parts.b.x + S, parts.b.y - S);
    grid.dragLinkTo(parts.bc, target, start);
    expect(parts.b.x).toBeCloseTo(target.x, 2);
    expect(parts.b.y).toBeCloseTo(target.y, 2);
    expect(dist(parts.b, parts.c)).toBeCloseTo(length, 3);
    expect(dist(parts.a, parts.b)).toBeCloseTo(2 * S, 3);
    expect(Math.hypot(parts.a.x, parts.a.y)).toBeGreaterThan(0.1 * S);
  });

  for (const hold of ['length', 'angle'] as const) {
    it(`keeps the body rigid and the absolute ask stable beside a held ${hold}`, () => {
      const parts = fourBar(service);
      parts.ab.hold = hold;
      parts.a.locked = true;
      const start = service.joints.map(({ id, x, y }) => ({ id, x, y }));
      const length = dist(parts.b, parts.c);
      const target = new Coord(parts.b.x + S, parts.b.y - S / 2);
      grid.dragLinkTo(parts.bc, target, start);
      const first = { bx: parts.b.x, by: parts.b.y, cx: parts.c.x, cy: parts.c.y };
      expect(dist(parts.b, parts.c)).toBeCloseTo(length, 3);
      for (let i = 0; i < 20; i++) grid.dragLinkTo(parts.bc, target, start);
      expect(parts.b.x).toBeCloseTo(first.bx, 3);
      expect(parts.b.y).toBeCloseTo(first.by, 3);
      expect(parts.c.x).toBeCloseTo(first.cx, 3);
      expect(parts.c.y).toBeCloseTo(first.cy, 3);
      expect(dist(parts.b, parts.c)).toBeCloseTo(length, 3);
      if (hold === 'length') expect(dist(parts.a, parts.b)).toBeCloseTo(2 * S, 3);
      else expect(parts.b.x).toBeCloseTo(0, 3);
      expect(parts.bc.hold).toBeUndefined();
    });
  }

  it('carries a load direction and custom center with the solved body motion', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    parts.bc.CoM = new Coord(S, (7 / 3) * S);
    parts.bc.comIsCustom = true;
    const force = new Force(
      'F1',
      parts.bc,
      new Coord(S, (7 / 3) * S),
      new Coord(S, (10 / 3) * S),
      false,
      true,
      10
    );
    parts.bc.forces.push(force);
    service.forces.push(force);
    const oldAngle = Math.atan2(parts.c.y - parts.b.y, parts.c.x - parts.b.x);
    const radius = dist(parts.b, parts.bc.CoM);
    grid.dragLink(parts.bc, S, -S / 2);
    const turn = Math.atan2(parts.c.y - parts.b.y, parts.c.x - parts.b.x) - oldAngle;
    expect(dist(parts.b, parts.bc.CoM)).toBeCloseTo(radius, 3);
    expect(force.startCoord.x).toBeCloseTo(parts.bc.CoM.x, 3);
    expect(force.startCoord.y).toBeCloseTo(parts.bc.CoM.y, 3);
    const direction = Math.atan2(
      force.endCoord.y - force.startCoord.y,
      force.endCoord.x - force.startCoord.x
    );
    expect(Math.sin(direction - Math.PI / 2 - turn)).toBeCloseTo(0, 6);
    expect(Math.cos(direction - Math.PI / 2 - turn)).toBeCloseTo(1, 6);
  });

  it('preserves the shape across welded leaves when a neighbor holds an endpoint', () => {
    const parts = fourBar(service);
    service.weldJoint(parts.c);
    parts.ab.hold = 'length';
    const body = service.links.find((link) => link !== parts.ab)!;
    const start = service.joints.map(({ id, x, y }) => ({ id, x, y }));
    const lengths = [dist(parts.b, parts.c), dist(parts.c, parts.d), dist(parts.b, parts.d)];
    grid.dragLinkTo(body, new Coord(parts.b.x + S, parts.b.y + S / 2), start);
    [dist(parts.b, parts.c), dist(parts.c, parts.d), dist(parts.b, parts.d)].forEach((now, i) =>
      expect(now).toBeCloseTo(lengths[i], 3)
    );
    expect(dist(parts.a, parts.b)).toBeCloseTo(2 * S, 3);
  });

  it('forgets a refusal once the bars that refused are unlocked', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    parts.bc.hold = 'length';
    parts.a.locked = true;
    parts.c.locked = true;
    grid.dragJoint(parts.b, new Coord(2 * S, 2 * S));
    expect(grid.lastHoldRefusal).toBeDefined();
    // Unlock everything: the next drag is an ordinary drag, and must not be
    // reported as the limit it no longer is.
    parts.ab.hold = undefined;
    parts.bc.hold = undefined;
    parts.a.locked = false;
    parts.c.locked = false;
    grid.dragJoint(parts.b, new Coord(1 * S, 2 * S));
    expect(parts.b.x).toBeCloseTo(1 * S, 6);
    expect(grid.lastHoldRefusal).toBeUndefined();
  });

  it('is not consulted when no held bar reaches the moved joint', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    grid.dragJoint(parts.c, new Coord(5 * S, 4 * S));
    expect(parts.c.x).toBeCloseTo(5 * S, 6);
    expect(parts.c.y).toBeCloseTo(4 * S, 6);
    expect(parts.b.y).toBeCloseTo(2 * S, 6);
  });
});

describe('a four-bar with every length locked', () => {
  let service: MechanismService;
  let grid: GridUtilsService;

  beforeEach(() => {
    const harness = createMechanismHarness();
    service = harness.service;
    grid = harness.injector.get(GridUtilsService);
  });

  const lengths = (parts: ReturnType<typeof fourBar>) => [
    dist(parts.a, parts.b),
    dist(parts.b, parts.c),
    dist(parts.c, parts.d),
  ];

  it('moves the coupler with a dragged joint and keeps every length', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    parts.bc.hold = 'length';
    parts.cd.hold = 'length';
    const was = lengths(parts);
    grid.dragJoint(parts.b, new Coord(0.6 * S, 1.9 * S));
    lengths(parts).forEach((now, index) => expect(now).toBeCloseTo(was[index], 3));
    expect(parts.b.x).toBeGreaterThan(0.3 * S);
    expect(grid.lastHoldRefusal).toBeUndefined();
  });

  it('refuses an ask the loop cannot follow, whole, rather than bending a lock', () => {
    // A shorter coupler and rocker than the stock four-bar's, so that with B
    // swung to the far side of A the two together cannot span to D.
    const parts = fourBar(service);
    parts.c.x = 1.5 * S;
    parts.c.y = 1 * S;
    parts.b.y = 1 * S;
    parts.d.x = 3 * S;
    service.links.forEach((link) => (link as RealLink).updateLengthAndAngle());
    service.updateMechanism();
    parts.ab.hold = 'length';
    parts.bc.hold = 'length';
    parts.cd.hold = 'length';
    // Locked, not just grounded: a ground pin gives before an ask is refused.
    parts.a.locked = true;
    parts.d.locked = true;
    const was = lengths(parts);
    const bWas = { x: parts.b.x, y: parts.b.y };
    grid.dragJoint(parts.b, new Coord(-1 * S, 0));
    lengths(parts).forEach((now, index) => expect(now).toBeCloseTo(was[index], 3));
    expect(parts.b.x).toBeCloseTo(bWas.x, 6);
    expect(parts.b.y).toBeCloseTo(bWas.y, 6);
    expect(grid.lastHoldRefusal?.satisfied).toBe(false);
    expect(grid.lastHoldRefusal?.immovable).toEqual([]);
  });
});

describe('a typed length or angle near a lock', () => {
  let service: MechanismService;
  let grid: GridUtilsService;

  beforeEach(() => {
    const harness = createMechanismHarness();
    service = harness.service;
    grid = harness.injector.get(GridUtilsService);
  });

  it('is solved exactly, moving the neighbors the locks allow', () => {
    // AB and CD locked, both grounded at one end; BC typed longer. Neither
    // end of BC can simply move outward -- each rides its own arc -- so the
    // solver swings both until BC is exactly the number asked.
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    parts.cd.hold = 'length';
    const ab = dist(parts.a, parts.b);
    const cd = dist(parts.c, parts.d);
    expect(grid.setBarValue(parts.bc, 'length', 5 * S)).toBe('applied');
    expect(dist(parts.b, parts.c)).toBeCloseTo(5 * S, 3);
    expect(dist(parts.a, parts.b)).toBeCloseTo(ab, 3);
    expect(dist(parts.c, parts.d)).toBeCloseTo(cd, 3);
    expect(parts.bc.length).toBeCloseTo(5 * S, 3);
    // The number could be met with both ground pins where they were.
    expect(parts.a).toMatchObject({ x: 0, y: 0 });
    expect(parts.d).toMatchObject({ x: 4 * S, y: 0 });
  });

  it('moves a ground pin before refusing a number the grounds alone cannot allow', () => {
    // BC at 20 cannot be spanned with A and D where they are, but neither is
    // locked, so the grounds give and the number is honored.
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    parts.cd.hold = 'length';
    expect(grid.setBarValue(parts.bc, 'length', 20 * S)).toBe('applied');
    expect(dist(parts.b, parts.c)).toBeCloseTo(20 * S, 3);
    expect(dist(parts.a, parts.b)).toBeCloseTo(2 * S, 3);
    expect(dist(parts.c, parts.d)).toBeCloseTo(Math.hypot(S, 3 * S), 3);
  });

  it('keeps a ground pin still when a typed coordinate can be met that way', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'angle';
    grid.dragJoint(parts.b, new Coord(0, 3 * S));
    expect(parts.b.y).toBeCloseTo(3 * S, 3);
    expect(parts.a).toMatchObject({ x: 0, y: 0 });
  });

  it('moves a ground pin when a typed coordinate cannot be met otherwise', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    grid.dragJoint(parts.b, new Coord(3 * S, 2 * S));
    expect(parts.b.x).toBeCloseTo(3 * S, 2);
    expect(parts.b.y).toBeCloseTo(2 * S, 2);
    expect(dist(parts.a, parts.b)).toBeCloseTo(2 * S, 3);
  });

  it('gives a bar with a locked length the typed angle, sign and all', () => {
    // AB points straight up with its length locked; asked for -90 degrees it
    // must point straight down, not stay where it is on the same line.
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    expect(grid.setBarValue(parts.ab, 'angle', -Math.PI / 2)).toBe('applied');
    expect(parts.b.x).toBeCloseTo(0, 3);
    expect(parts.b.y).toBeCloseTo(-2 * S, 3);
    expect(parts.ab.hold).toBe('length');
    // And at an angle off the line it stood on, the locked length still holds.
    expect(grid.setBarValue(parts.ab, 'angle', Math.PI / 6)).toBe('applied');
    expect(dist(parts.a, parts.b)).toBeCloseTo(2 * S, 3);
    expect(Math.atan2(parts.b.y - parts.a.y, parts.b.x - parts.a.x)).toBeCloseTo(Math.PI / 6, 4);
  });

  it('keeps a locked bar locked at the number typed into it', () => {
    const parts = fourBar(service);
    parts.bc.hold = 'length';
    expect(grid.setBarValue(parts.bc, 'length', 4 * S)).toBe('applied');
    expect(dist(parts.b, parts.c)).toBeCloseTo(4 * S, 3);
    expect(parts.bc.hold).toBe('length');
  });

  it('refuses a number no configuration allows, and moves nothing', () => {
    const parts = fourBar(service);
    parts.ab.hold = 'length';
    parts.cd.hold = 'length';
    parts.a.locked = true;
    parts.d.locked = true;
    const bc = dist(parts.b, parts.c);
    expect(grid.setBarValue(parts.bc, 'length', 20 * S)).toBe('refused');
    expect(dist(parts.b, parts.c)).toBeCloseTo(bc, 6);
  });

  it('is solved about a locked end, moving only the free one', () => {
    const parts = fourBar(service);
    parts.b.locked = true;
    const bWas = { x: parts.b.x, y: parts.b.y };
    expect(grid.setBarValue(parts.bc, 'length', 5 * S)).toBe('applied');
    expect(dist(parts.b, parts.c)).toBeCloseTo(5 * S, 3);
    expect(parts.b.x).toBeCloseTo(bWas.x, 6);
    expect(parts.b.y).toBeCloseTo(bWas.y, 6);
  });

  it('leaves a bar no lock reaches to the panel', () => {
    const parts = fourBar(service);
    expect(grid.setBarValue(parts.bc, 'length', 5 * S)).toBe('unheld');
  });
});
