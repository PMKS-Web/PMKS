import { MechanismFixture } from './fixture';

/**
 * A driven block at B with two riders, BD and BE, on a slot cut in the bar AC.
 *
 * The shape behind #384: changing a driven Pin-in-slot's type to Prismatic has
 * to fuse both riders into one body, or the drive still meets three bodies at B
 * (the carrier and two riders). `welded: true` opens it already Prismatic, for
 * the change that must still be refused: Welded, which takes the slot away from
 * a drive measured along it.
 */
export function drivenTwoRiderSlotFixture(options: { welded?: boolean } = {}): MechanismFixture {
  return {
    joints: [
      { id: 'A', x: -4, y: 0, ground: true },
      { id: 'C', x: 4, y: 0 },
      { id: 'B', x: 0, y: 0 },
      { id: 'D', x: 3, y: 3 },
      { id: 'E', x: -3, y: 3 },
    ],
    links: [{ joints: 'AC' }, { joints: 'BD' }, { joints: 'BE' }],
    slider: { at: 'B', angleRad: 0, on: { carrier: 'AC', a: 'A', b: 'C' }, input: true },
    welds: options.welded ? ['B'] : [],
    inputAngVel: 0,
  };
}
