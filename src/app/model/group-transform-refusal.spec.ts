import { RevJoint } from './joint';
import { RealLink } from './link';
import { groupHoldRefusal, groupTransformRefusal } from './group-transform-refusal';

describe('groupHoldRefusal', () => {
  const bar = (id: string) =>
    new RealLink(id, [new RevJoint(id[0], 0, 0), new RevJoint(id[1], 1, 0)]);

  it('names the hold and the control that releases it', () => {
    const ab = bar('AB');
    ab.hold = 'length';
    expect(groupHoldRefusal([{ link: ab, values: ['length'] }], 'scale')).toBe(
      'Resizing the selection would change fixed length AB. Turn off its Fixed Length first.'
    );
  });

  it('lists several bars and both controls when both are in the way', () => {
    const ab = bar('AB');
    const cd = bar('CD');
    ab.hold = 'length';
    cd.hold = 'angle';
    expect(
      groupHoldRefusal(
        [
          { link: ab, values: ['length'] },
          { link: cd, values: ['angle'] },
        ],
        'rotate'
      )
    ).toBe(
      'Turning the selection would change fixed length AB and fixed angle CD. ' +
        'Turn off their Fixed Length and Fixed Angle first.'
    );
  });
});

describe('groupTransformRefusal', () => {
  it('names the Lock when no hold is in the way', () => {
    expect(
      groupTransformRefusal({ applied: false, lockedJointIds: ['A', 'B'] }, 'translate')
    ).toEqual({
      key: 'selection.transform-locked',
      text: 'The selection is held by A, B. Unlock it before transforming the group.',
    });
  });

  it('names the hold for a turn or a resize', () => {
    const ab = new RealLink('AB', [new RevJoint('A', 0, 0), new RevJoint('B', 1, 0)]);
    ab.hold = 'angle';
    const refused = groupTransformRefusal(
      {
        applied: false,
        lockedJointIds: [],
        reason: 'held',
        brokenHolds: [{ link: ab, values: ['angle'] }],
      },
      'rotate'
    );
    expect(refused.key).toBe('selection.transform-held');
    expect(refused.text).toContain('Turn off its Fixed Angle first.');
  });
});
