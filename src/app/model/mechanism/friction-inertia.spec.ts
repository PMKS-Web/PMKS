import { RevJoint } from '../joint';
import { RealLink } from '../link';
import { Coord } from '../coord';
import { ColorService } from '../../services/color.service';
import { SettingsService } from '../../services/settings.service';
import { ForceSolver } from './force-solver';

function barAtScale(scale: number, enabled: boolean) {
  new SettingsService();
  new ColorService();
  const a = new RevJoint('A', 0, 0, true, true),
    b = new RevJoint('B', 4 * scale, 0);
  const bar = new RealLink('AB', [a, b]);
  bar.mass = 1000;
  bar.massMoI = 0;
  bar.CoM = new Coord(2 * scale, 0);
  a.links = [bar];
  b.links = [bar];
  if (enabled)
    a.friction = { staticCoefficient: 0.3, kineticCoefficient: 0.2, radius: 0.5 * scale };
  return ForceSolver.analyzeFrame(
    [a, b],
    [bar],
    'dynamic',
    false,
    'cm',
    0,
    {
      linkAccelerations: new Map([['AB', [-2 * scale, 0]]]),
      linkAngularAccelerations: new Map([['AB', 0]]),
      pistonAccelerations: new Map(),
    },
    false,
    { coordinateScale: scale, jointVelocities: new Map(), angularVelocities: new Map([['AB', 1]]) }
  );
}
describe('friction inertia safeguard on current staging', () => {
  it('preserves the physical frictionless result on staging', () => {
    // Staging already converts model-scale acceleration to physical SI.
    expect(Math.abs(barAtScale(200, false).jointReactions.get('A')![0])).toBeCloseTo(0.02, 12);
  });
  it('retains the separate friction/inertia integration safeguard', () => {
    const frame = barAtScale(200, true);
    expect(frame.status).toBe('friction-unresolved');
    expect(frame.message).toContain('Use Static analysis');
    expect(frame.jointReactions.size).toBe(0);
    expect(frame.inputEffort).toBeUndefined();
    expect(frame.friction).toBeUndefined();
  });
  it('does not bypass the safeguard when coordinate metadata is absent or one', () => {
    const frame = barAtScale(1, true);
    expect(frame.status).toBe('friction-unresolved');
    expect(frame.frictionUnavailable?.reason).toBe('inertia');
    expect(frame.inputEffort).toBeUndefined();
  });
});
