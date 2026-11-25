import '../../model/joint';
import { RevJoint } from '../../model/joint';
import { NotificationService } from '../../services/notification.service';
import { ForceRefusalNotice } from './force-refusal-notice';

describe('the refusal a force drag says at a joint', () => {
  function notice() {
    const notify = { refusal: vi.fn(), dismissId: vi.fn() };
    return { notify, notice: new ForceRefusalNotice(notify as unknown as NotificationService) };
  }

  it('says one message per joint and takes the last joint’s down', () => {
    const { notify, notice: said } = notice();
    said.refuse(new RevJoint('B', 0, 0), 'not on B');
    said.refuse(new RevJoint('C', 1, 0), 'not on C');
    expect(notify.refusal.mock.calls).toEqual([
      ['force.refused-joint.B', 'not on B', undefined],
      ['force.refused-joint.C', 'not on C', undefined],
    ]);
    expect(notify.dismissId.mock.calls).toEqual([['force.refused-joint.B']]);
  });

  it('does not take down the message for the joint it is still over', () => {
    const { notify, notice: said } = notice();
    const b = new RevJoint('B', 0, 0);
    said.refuse(b, 'not on B');
    said.clearRing();
    said.refuse(b, 'not on B');
    expect(notify.dismissId).not.toHaveBeenCalled();
    expect(said.joint).toBe(b);
  });

  it('starts the next drag with nothing ringed and nothing to take down', () => {
    const { notify, notice: said } = notice();
    said.refuse(new RevJoint('B', 0, 0), 'not on B');
    said.forget();
    expect(said.joint).toBeUndefined();
    said.refuse(new RevJoint('C', 1, 0), 'not on C');
    expect(notify.dismissId).not.toHaveBeenCalled();
  });

  it('says a joint’s refusal again when the hand comes back to it within the cooldown', () => {
    const { notify, notice: said } = notice();
    const b = new RevJoint('B', 0, 0);
    said.refuse(b, 'not on B');
    said.refuse(new RevJoint('C', 1, 0), 'not on C');
    said.refuse(b, 'not on B');
    // B's message was taken down by this notice, so its cooldown is waived once.
    expect(notify.refusal.mock.calls[2]).toEqual([
      'force.refused-joint.B',
      'not on B',
      { cooldownMs: 0 },
    ]);
    said.refuse(b, 'not on B');
    expect(notify.refusal.mock.calls[3][2]).toBeUndefined();
  });
});
