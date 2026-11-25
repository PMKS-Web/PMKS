// joint.ts first: the model modules form an import cycle that only initializes
// cleanly when entered here.
import '../model/joint';
import { Injector } from '@angular/core';
import { PrisJoint, RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { JointType } from '../model/joint-type';
import { createMechanismHarness, wireGraph } from '../../test-utils/mechanism-harness';
import { buildMechanism, inModelUnits } from '../../test-utils/verification/fixture';
import { drivenTwoRiderSlotFixture } from '../../test-utils/verification/joint-type-fixtures';
import { JointTypeService } from './joint-type.service';

/**
 * A change of joint type is one press, so it is one edit: whichever of the slot
 * and the weld it has to change, the history gets one entry, and a change the
 * model refuses gets none and changes nothing.
 *
 * Every joint here is fetched by its **letter** rather than held as an object.
 * Gaining or losing a slot exchanges the joint for one of the other class --
 * a `PrisJoint` for a `RevJoint` -- keeping its letter (Stage 1 of
 * `docs/joint-type-and-cylinder-plan.md`), so a held reference is a dead object
 * the moment the type changes. Held anyway, `typeOf` reads the corpse, decides
 * the drawing already has the type being asked for, and reports success having
 * done nothing.
 */
function bentBar() {
  const harness = createMechanismHarness();
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 2, 0);
  const c = new RevJoint('C', 3, 2);
  harness.service.joints = [a, b, c];
  harness.service.links = [new RealLink('AB', [a, b]), new RealLink('BC', [b, c])];
  wireGraph(harness.service);
  harness.active.updateSelectedObj(c);
  const types = Injector.create({
    providers: [{ provide: JointTypeService, deps: [] }],
    parent: harness.injector,
  }).get(JointTypeService);
  /** The joint with this letter, as the drawing holds it now. */
  const live = (id: string): RealJoint =>
    harness.service.joints.find((joint) => joint.id === id) as RealJoint;
  return { harness, types, live, a, b, c };
}

/** The gallery's driven two-rider slot (`drivenTwoRiderSlotFixture`), loaded into the service. */
function drivenSlot() {
  const harness = createMechanismHarness();
  const built = buildMechanism(inModelUnits(drivenTwoRiderSlotFixture()));
  harness.service.joints = built.joints;
  harness.service.links = built.links;
  harness.service.finishStructuralEdit(false);
  const types = Injector.create({
    providers: [{ provide: JointTypeService, deps: [] }],
    parent: harness.injector,
  }).get(JointTypeService);
  const live = (id: string): RealJoint =>
    harness.service.joints.find((joint) => joint.id === id) as RealJoint;
  return { harness, types, live };
}

describe('JointTypeService', () => {
  it('walks a pin through every type and back, one history entry per change', () => {
    const { harness, types, live } = bentBar();
    const walk: JointType[] = ['prismatic', 'welded', 'pin-in-slot', 'revolute', 'welded'];
    for (const type of walk) {
      const before = harness.saveCount();
      expect(types.set(live('B'), type), `to ${type}`).toBe(true);
      expect(types.typeOf(live('B')), `to ${type}`).toBe(type);
      expect(harness.saveCount() - before, `to ${type}`).toBe(1);
    }
  });

  it('makes a pin on one bar Prismatic, the slot and the weld in one entry', () => {
    const { harness, types, live } = bentBar();
    const before = harness.saveCount();

    expect(types.set(live('A'), 'prismatic')).toBe(true);

    expect(types.typeOf(live('A'))).toBe('prismatic');
    expect(harness.saveCount() - before).toBe(1);
  });

  it('spends no new letter on the joint it retypes', () => {
    // A slider used to be three objects, and the prismatic one took a letter of
    // its own that nothing ever drew. The surviving joint keeps the pin's,
    // which is what every link id, force and lock already names.
    const { harness, types, live } = bentBar();

    types.set(live('B'), 'pin-in-slot');

    expect(harness.service.joints.map((joint) => joint.id).sort()).toEqual(['A', 'B', 'C']);
    expect(harness.service.links.map((link) => link.id).sort()).toEqual(['AB', 'BC']);
    expect(live('B') instanceof PrisJoint).toBe(true);
  });

  it('refuses what the model refuses, and then changes and saves nothing', () => {
    const { harness, types, live } = bentBar();
    const before = harness.saveCount();

    // A has one link, so there is nothing at it for a weld to fuse.
    expect(types.refusal(live('A'), 'welded')?.short).toBe('needs 2 links');
    expect(types.set(live('A'), 'welded')).toBe(false);

    expect(types.typeOf(live('A'))).toBe('revolute');
    expect(harness.saveCount()).toBe(before);
  });

  it('puts the selection back where it was once the change is made', () => {
    const { harness, types, live, c } = bentBar();

    types.set(live('B'), 'pin-in-slot');

    expect(harness.active.selectedJoint).toBe(c);
  });

  it('puts it back on the joint that replaced the one retyped, not on the one dropped', () => {
    // The test above retypes a joint the reader has *not* selected, which is
    // the one arrangement where this cannot go wrong. The panel is the other
    // one: it changes the type of whatever is selected, so the joint put back
    // is the joint just exchanged. Gaining a slot swaps it for one of the other
    // class keeping its letter, so restoring the object restores the one the
    // drawing has dropped.
    const { harness, types, live } = bentBar();
    harness.active.updateSelectedObj(live('B'));

    types.set(live('B'), 'pin-in-slot');

    expect(harness.active.selectedJoint).toBe(live('B'));
    expect(harness.active.selectedJoint).toBeInstanceOf(PrisJoint);
  });

  it('takes a second press, read off the selection the way the panel reads it', () => {
    // `EditPanelComponent.setJointType` reads `selectedJoint` on every press.
    // Handed back a joint the drawing no longer holds, the second press reads
    // the old flags off it, decides the drawing is already the type being asked
    // for, and returns having written nothing -- no slot, and no history entry.
    const { harness, types, live } = bentBar();
    harness.active.updateSelectedObj(live('B'));

    expect(types.set(harness.active.selectedJoint, 'pin-in-slot')).toBe(true);
    expect(types.typeOf(harness.active.selectedJoint)).toBe('pin-in-slot');

    const before = harness.saveCount();
    expect(types.set(harness.active.selectedJoint, 'revolute')).toBe(true);

    expect(types.typeOf(live('B'))).toBe('revolute');
    expect(live('B') instanceof PrisJoint).toBe(false);
    expect(harness.saveCount() - before).toBe(1);
  });

  it('puts the slot on the joint it was asked about, not on the joint selected', () => {
    // Every edit ends by putting the selection back on what the reader
    // selected, and the slider edit reads the selection. Welded to Pin-in-slot
    // is an unweld and then a slot, and the slot once landed on C.
    const { types, live } = bentBar();
    types.set(live('B'), 'welded');

    expect(types.set(live('B'), 'pin-in-slot')).toBe(true);

    expect(types.typeOf(live('C'))).toBe('revolute');
  });

  it('hands back the same choice until an edit moves the drawing on', () => {
    const { harness, types, live } = bentBar();
    const b = live('B');
    const first = types.choiceFor(b);
    expect(types.choiceFor(b)).toBe(first);

    harness.service.updateMechanism(false);

    const next = types.choiceFor(b);
    expect(next).not.toBe(first);
    expect(next).toEqual(first);
  });

  it('keeps a grounded joint grounded through a change of type, in one entry', () => {
    // The choice draws every type on the frame while Grounded is on, so the
    // Revolute it offers a grounded slider is a ground pin. Taking the slot off
    // used to drop the ground it carried.
    const { harness, types, live } = bentBar();
    live('A').ground = true;
    harness.service.updateMechanism(false);
    types.set(live('A'), 'pin-in-slot');
    const before = harness.saveCount();

    expect(types.set(live('A'), 'revolute')).toBe(true);

    expect(live('A').ground).toBe(true);
    expect(harness.saveCount() - before).toBe(1);
  });

  it('reads a grounded slider as grounded, on the joint itself', () => {
    // The ground belongs to the guide, and the guide used to be a prismatic
    // joint beside the pin the panel had selected -- so this asked one object
    // and drew the other. One joint is both now: it carries the ground, and the
    // choice reads it straight off.
    const { harness, types, live } = bentBar();
    live('A').ground = true;
    harness.service.updateMechanism(false);

    types.set(live('A'), 'pin-in-slot');

    const slider = live('A');
    expect(slider instanceof PrisJoint).toBe(true);
    expect(slider.ground, 'the slot is what is grounded').toBe(true);
    expect(types.isGrounded(slider)).toBe(true);
    expect(types.choiceFor(slider).icons[0]).toBe('joint_revolute_grounded');
  });

  it('keeps the drive when a grounded, driven slider becomes a pin', () => {
    // The linear-actuator shape: a grounded slot that is also the drive. Taking
    // it to Revolute carries `input` across in the exchange, and then the
    // Grounded fix-up put the ground back through `toggleGround`, whose
    // plain-joint branch ends `input = false`. The joint came back grounded and
    // un-driven with nothing said -- and a grounded pin is the standard crank,
    // so there is no reason for the drive not to survive the way the ground
    // does.
    const { harness, types, live } = bentBar();
    live('A').ground = true;
    harness.service.updateMechanism(false);
    types.set(live('A'), 'pin-in-slot');
    live('A').input = true;
    live('A').driveSpeed = -12;
    harness.service.updateMechanism(false);

    expect(types.set(live('A'), 'revolute')).toBe(true);

    expect(live('A').ground, 'still standing on the frame').toBe(true);
    expect(live('A').input, 'still the drive').toBe(true);
    expect(live('A').driveSpeed, 'at the speed it was turning').toBeCloseTo(-12, 9);
  });

  it('makes a driven floating Pin-in-slot Prismatic, fusing its riders and keeping the drive (#384)', () => {
    // B rides the bar AC and carries two riders. A slider's drive travels the
    // slot, which the Slide's weld leaves free, so the change is allowed -- and
    // has to fuse the two riders into one body, or the drive still sees three
    // bodies at B (the carrier and two riders) and setup refuses it.
    const { harness, types, live } = drivenSlot();
    expect(types.typeOf(live('B'))).toBe('pin-in-slot');
    expect(live('B').input).toBe(true);
    expect(types.refusal(live('B'), 'prismatic')).toBeUndefined();
    const before = harness.saveCount();

    expect(types.set(live('B'), 'prismatic')).toBe(true);

    const slider = live('B');
    expect(types.typeOf(slider)).toBe('prismatic');
    expect(slider.input, 'still the drive').toBe(true);
    const riders = harness.service.links.filter((link) => link.joints.includes(slider));
    expect(riders.length, 'one fused rider').toBe(1);
    expect(riders[0].joints.map((joint) => joint.id).sort()).toEqual(['B', 'D', 'E']);
    expect(harness.saveCount() - before).toBe(1);
  });

  it('walks a grounded, driven pin through every type and back, keeping the drive (#384)', () => {
    // A slot comes off a driven joint and goes back on it; a weld goes on a
    // grounded drive and comes off it. Every change is one entry, and the drive
    // and its speed come back exactly as they left.
    //
    // A and C are grounded too, so nothing here moves: the walk is about what
    // the change of type keeps, and a drive along an open grounded slot never
    // repeats, which had the solver run every step out to its sample cap.
    const { harness, types, live } = bentBar();
    live('A').ground = true;
    live('C').ground = true;
    live('B').ground = true;
    live('B').input = true;
    live('B').driveSpeed = -12;
    harness.service.updateMechanism(false);
    const walk: JointType[] = [
      'pin-in-slot',
      'prismatic',
      'welded',
      'revolute',
      'prismatic',
      'pin-in-slot',
      'welded',
      'prismatic',
      'revolute',
    ];
    for (const type of walk) {
      const before = harness.saveCount();
      expect(types.set(live('B'), type), `to ${type}`).toBe(true);
      expect(types.typeOf(live('B')), `to ${type}`).toBe(type);
      expect(live('B').ground, `grounded at ${type}`).toBe(true);
      expect(live('B').input, `driven at ${type}`).toBe(true);
      expect(live('B').driveSpeed, `speed at ${type}`).toBeCloseTo(-12, 9);
      expect(harness.saveCount() - before, `to ${type}`).toBe(1);
    }
  });

  it('walks a floating, driven pin between Revolute and both slot types, keeping the drive', () => {
    const { harness, types, live } = bentBar();
    live('B').input = true;
    live('B').driveSpeed = 4;
    harness.service.updateMechanism(false);
    const walk: JointType[] = [
      'pin-in-slot',
      'revolute',
      'prismatic',
      'pin-in-slot',
      'prismatic',
      'revolute',
    ];
    for (const type of walk) {
      expect(types.set(live('B'), type), `to ${type}`).toBe(true);
      expect(types.typeOf(live('B')), `to ${type}`).toBe(type);
      expect(live('B').input, `driven at ${type}`).toBe(true);
      expect(live('B').driveSpeed, `speed at ${type}`).toBe(4);
    }
  });

  it('refuses Welded on a driven floating slot, from Pin-in-slot and from Prismatic alike', () => {
    // Either way the slot comes off and leaves a driven pin welded with
    // nothing grounding it. From Prismatic the change runs no weld step at all
    // -- the weld is kept, not made -- so the refusal has to come from the
    // change of type itself.
    const { harness, types, live } = drivenSlot();
    for (const from of ['pin-in-slot', 'prismatic'] as const) {
      expect(types.set(live('B'), from), `to ${from}`).toBe(true);
      const before = harness.saveCount();

      expect(types.refusal(live('B'), 'welded')?.code, `from ${from}`).toBe('weld.is-driven');
      expect(types.set(live('B'), 'welded'), `from ${from}`).toBe(false);

      expect(types.typeOf(live('B')), `from ${from}`).toBe(from);
      expect(live('B').input, `from ${from}`).toBe(true);
      expect(harness.saveCount(), `from ${from}`).toBe(before);
    }
  });
});
