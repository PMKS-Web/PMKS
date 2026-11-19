import './joint';
import { Coord } from './coord';
import { Force } from './force';
import { RevJoint } from './joint';
import { RealLink } from './link';
import { carryForce, frameTurn } from './force-carry';

function forceOn(local: boolean, end = new Coord(1, 1)): Force {
  const link = new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', 2, 0)]);
  return new Force('F1', link, new Coord(1, 0), end, local, true, 6);
}

describe('carrying a force with its body', () => {
  it('moves a Grid force’s point and keeps its bearing, arrow and magnitude', () => {
    const force = forceOn(false);
    carryForce(force, { x: 5, y: 5 }, { x: 0, y: 1 }, Math.PI / 2);
    expect([force.startCoord.x, force.startCoord.y]).toEqual([5, 5]);
    expect(force.endCoord.x).toBeCloseTo(5, 12);
    expect(force.endCoord.y).toBeCloseTo(6, 12);
    expect(force.angleRad).toBeCloseTo(Math.PI / 2, 12);
    expect(force.mag).toBe(6);
  });

  it('turns a Local force by however far its link turned, keeping its arrow’s length', () => {
    const force = forceOn(true);
    carryForce(force, { x: 5, y: 5 }, { x: 0, y: 1 }, Math.PI / 2);
    expect(force.endCoord.x).toBeCloseTo(4, 12);
    expect(force.endCoord.y).toBeCloseTo(5, 12);
    expect(force.angleRad).toBeCloseTo(Math.PI, 12);
    expect(force.mag).toBe(6);
  });

  it('turns the stored direction of a Local force whose arrow has no length', () => {
    const force = forceOn(true);
    force.moveDirectionHandle(new Coord(1, 0));
    carryForce(force, { x: 2, y: 0 }, { x: 0, y: 0 }, Math.PI / 2);
    expect(force.angleRad).toBeCloseTo(Math.PI, 12);
    // Still no arrow: the turn is the stored direction's, not a new handle's.
    expect([force.endCoord.x, force.endCoord.y]).toEqual([2, 0]);
  });

  it('adds a replayed turn to the direction it began at, not to the last move’s', () => {
    // A group drag replays one snapshot on every pointer move, each with the
    // whole turn so far. Read off the force, a collapsed arrow's direction
    // already held the last move's turn, and the next added it again.
    const force = forceOn(true);
    force.moveDirectionHandle(new Coord(1, 0));
    const began = force.angleRad;
    carryForce(force, { x: 1, y: 0 }, { x: 0, y: 0 }, 0.25, began);
    carryForce(force, { x: 1, y: 0 }, { x: 0, y: 0 }, 0.5, began);
    expect(force.angleRad).toBeCloseTo(began + 0.5, 12);
  });

  it('turns a collapsed Local force even when the move leaves its tip a rounding error away', () => {
    // A bar from (0, 0) to (4, 0) turned 90 degrees about its middle sends the
    // anchor at (0.13, 0) to (2, -1.87). Moved by the same step, the tip lands
    // 2.2e-16 from it, which is not a collapsed arrow any more.
    const link = new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', 4, 0)]);
    const force = new Force('F1', link, new Coord(0.13, 0), new Coord(0.13, 1), true, true, 6);
    force.moveDirectionHandle(new Coord(0.13, 0));
    const began = force.angleRad;
    const at = { x: 2 + (0.13 - 2) * Math.cos(Math.PI / 2), y: (0.13 - 2) * Math.sin(Math.PI / 2) };
    carryForce(force, at, { x: 0, y: 0 }, Math.PI / 2, began);
    expect(force.angleRad).toBeCloseTo(began + Math.PI / 2, 12);
    expect([force.endCoord.x, force.endCoord.y]).toEqual([force.startCoord.x, force.startCoord.y]);
  });

  it('says how far a frame turned, the short way round', () => {
    const turn = frameTurn(
      [
        { x: 0, y: 0 },
        { x: -1, y: 0.01 },
      ],
      [
        { x: 0, y: 0 },
        { x: -1, y: -0.01 },
      ]
    );
    expect(turn).toBeCloseTo(0.02, 3);
  });
});
