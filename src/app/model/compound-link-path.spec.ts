import { buildCompoundPath } from './compound-link-path';

/**
 * The Bell Crank library card's welded body, CD and DE meeting at a right
 * angle at D, exactly as the canvas built their outlines (#291). Both caps at D
 * lie on one circle, and their flattened vertices fall within 1e-14 of each
 * other -- close enough that the union library could not close a ring.
 */
const BELL_CRANK_LEAVES = [
  'M -362.4226615137755 172.2655364438033 L -16.012499999999985 -27.73446355619665 A 32.025 32.025 0 0 1 16.012499999999996 27.734463556196648 L -330.3976615137755 227.73446355619663 A 32.025 32.025 0 0 1 -362.4226615137755 172.2655364438033 Z ',
  'M -27.734463556196648 16.012499999999996 L 132.2655364438033 293.1406292110204 A 32.025 32.025 0 0 0 187.73446355619663 261.1156292110204 L 27.734463556196648 -16.012499999999996 A 32.025 32.025 0 0 0 -27.734463556196648 16.012499999999996 Z ',
];

function ringArea(ring: number[][]): number {
  let twice = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    twice += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(twice) / 2;
}

describe('buildCompoundPath', () => {
  it('fuses two bars whose caps share a circle at the weld (#291)', () => {
    const geometry = buildCompoundPath(BELL_CRANK_LEAVES, 32.025);

    expect(geometry.rings).toHaveLength(1);
    // One outline, not the two leaves laid side by side.
    expect(geometry.path.match(/M/g)).toHaveLength(1);
    // Two bars of 400 and 320 units by 64, plus their caps, less the overlap
    // at D: well over either bar alone and under the two added up.
    const area = ringArea(geometry.rings[0]);
    const capsule = (length: number) => length * 64.05 + Math.PI * 32.025 ** 2;
    expect(area).toBeGreaterThan(capsule(400));
    expect(area).toBeLessThan(capsule(400) + capsule(320));
  });

  it('still falls back to the leaves for a path it cannot read', () => {
    const geometry = buildCompoundPath(['M 0 0 C 1 1 2 2 3 3 Z', 'M 0 0 L 1 0 L 1 1 Z'], 1);

    expect(geometry.rings).toEqual([]);
    expect(geometry.path).toBe('M 0 0 C 1 1 2 2 3 3 Z M 0 0 L 1 0 L 1 1 Z');
  });
});
