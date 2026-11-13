import { createMechanismHarness } from '../../test-utils/mechanism-harness';
import { encodeUrlOf } from '../../test-utils/url-encoding';
import { TEMPLATE_LINKAGES } from '../component/MODALS/templates/template-linkages';
import { ActiveObjService } from '../services/active-obj.service';
import { MechanismService } from '../services/mechanism.service';
import { SettingsService } from '../services/settings.service';
import { MechanismBuilder } from '../services/transcoding/mechanism-builder';
import { StringTranscoder } from '../services/transcoding/string-transcoder';
import { settleHolds } from './hold-solver';
import { holdChips } from './hold-chips';
import { RevJoint } from './joint';
import { heldValues, holdsAngle, holdsLength, holdWith, LinkHold, RealLink } from './link';
import { describeHold, heldBars, holdJoints } from './link-holds';

/**
 * A bar may hold its length and its angle at once (#309). That is not a Lock:
 * the bar keeps its shape and its direction, and may still slide sideways.
 */

/** A free bar A-B, 4 long, at 0 degrees, with `hold`. */
function bar(hold: LinkHold, groundA = false) {
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 4, 0);
  a.ground = groundA;
  const ab = new RealLink('AB', [a, b]);
  a.links.push(ab);
  b.links.push(ab);
  ab.hold = hold;
  return { a, b, ab };
}

describe('a hold on both values', () => {
  it('adds and removes one value at a time', () => {
    expect(holdWith(undefined, 'length', true)).toBe('length');
    expect(holdWith('length', 'angle', true)).toBe('both');
    expect(holdWith('both', 'length', false)).toBe('angle');
    expect(holdWith('angle', 'angle', false)).toBeUndefined();
    expect(holdWith('both', 'angle', true)).toBe('both');
    expect([holdsLength('both'), holdsAngle('both')]).toEqual([true, true]);
    expect(heldValues('both')).toEqual(['length', 'angle']);
    expect(heldValues(undefined)).toEqual([]);
  });

  it('is two constraints to the solver, one per value', () => {
    const { ab } = bar('both');
    expect(heldBars([ab]).map((entry) => entry.hold)).toEqual(['length', 'angle']);
  });

  it('lets the bar slide sideways without turning or stretching', () => {
    const { a, b, ab } = bar('both');
    const joints = holdJoints([a, b], () => false);
    const out = settleHolds(joints, heldBars([ab]), [{ id: 'A', x: 1, y: 2 }]);
    expect(out.satisfied).toBe(true);
    const movedA = out.positions.get('A')!;
    const movedB = out.positions.get('B')!;
    expect(movedA.x).toBeCloseTo(1, 6);
    expect(movedA.y).toBeCloseTo(2, 6);
    // B carried along exactly: same length, same direction.
    expect(movedB.x).toBeCloseTo(5, 6);
    expect(movedB.y).toBeCloseTo(2, 6);
  });

  it('leaves a bar with one locked end no freedom at all, unlike one hold alone', () => {
    const both = bar('both', true);
    const pinned = holdJoints([both.a, both.b], (joint) => joint.ground);
    const stuck = settleHolds(pinned, heldBars([both.ab]), [{ id: 'B', x: 3, y: 3 }]);
    expect(stuck.immovable).toEqual(['B']);

    const one = bar('length', true);
    const free = holdJoints([one.a, one.b], (joint) => joint.ground);
    expect(settleHolds(free, heldBars([one.ab]), [{ id: 'B', x: 3, y: 3 }]).immovable).toEqual([]);
  });

  it('carries a grounded end along, since ground is a tiebreaker and not a lock', () => {
    const both = bar('both', true);
    const grounded = holdJoints(
      [both.a, both.b],
      () => false,
      (joint) => joint.ground
    );
    const out = settleHolds(grounded, heldBars([both.ab]), [{ id: 'B', x: 6, y: 3 }]);
    expect(out.immovable).toEqual([]);
    expect(out.satisfied).toBe(true);
    // The whole bar translates: B where it was asked, A the bar's length behind.
    expect(out.positions.get('B')!.x).toBeCloseTo(6, 6);
    expect(out.positions.get('B')!.y).toBeCloseTo(3, 6);
    expect(out.positions.get('A')!.x).toBeCloseTo(2, 6);
    expect(out.positions.get('A')!.y).toBeCloseTo(3, 6);
  });

  it('keeps a grounded end still while the dragged end has a freedom of its own', () => {
    const one = bar('length', true);
    const grounded = holdJoints(
      [one.a, one.b],
      () => false,
      (joint) => joint.ground
    );
    const out = settleHolds(grounded, heldBars([one.ab]), [{ id: 'B', x: 3, y: 3 }]);
    expect(out.positions.has('A')).toBe(false);
  });

  it('wears a chip for each value', () => {
    const { ab } = bar('both');
    expect(holdChips([ab], []).map((chip) => chip.hold)).toEqual(['length', 'angle']);
  });

  it('is named as both in a sentence', () => {
    const { ab } = bar('both');
    expect(describeHold(ab)).toBe('fixed length and angle AB');
  });
});

describe('a hold on both values, through the URL', () => {
  function reopen(source: MechanismService): MechanismService {
    const decoder = new StringTranscoder();
    decoder.decodeURL(encodeUrlOf(source, new SettingsService()));
    const target = {
      joints: [],
      links: [],
      forces: [],
      mechanismTimeStep: 0,
    } as unknown as MechanismService;
    new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(
      false
    );
    return target;
  }

  function fourBar() {
    const harness = createMechanismHarness();
    const decoder = new StringTranscoder();
    decoder.decodeURL(TEMPLATE_LINKAGES['4-Bar']);
    new MechanismBuilder(harness.service, decoder, harness.settings, harness.active).build(true);
    return harness.service;
  }

  const holdsOf = (service: MechanismService) =>
    Object.fromEntries(
      service.links
        .filter((link): link is RealLink => link instanceof RealLink && link.hold !== undefined)
        .map((link) => [link.id, link.hold])
    );

  it('comes back holding both, beside a bar holding one', () => {
    const service = fourBar();
    const [first, second] = service.links as RealLink[];
    first.hold = 'both';
    second.hold = 'angle';
    expect(holdsOf(reopen(service))).toEqual({ [first.id]: 'both', [second.id]: 'angle' });
  });

  it('writes a single hold exactly as before, so old links read the same', () => {
    const service = fourBar();
    const [first] = service.links as RealLink[];
    first.hold = 'length';
    const url = encodeUrlOf(service, new SettingsService());
    expect(url).toContain(`Hl${first.id}`);
    expect(url).not.toContain(`Ha${first.id}`);
    expect(holdsOf(reopen(service))).toEqual({ [first.id]: 'length' });
  });
});
