import { EditRefusal } from '../../model/edit-permission';
import { NotificationService } from '../../services/notification.service';

/** The two ways out a refused Delete can offer, run by the canvas. */
export interface DeleteWaysOut {
  toEdit: () => void;
  toStart: () => void;
}

/**
 * Say why the Delete key did nothing, with the way out on the message.
 *
 * Only the analysis modes' refusal used to be said. Playing, or parked
 * mid-cycle, the key was swallowed without a word, which reads as a key that
 * does not work (#262).
 */
export function sayWhyNotDeleted(
  notify: NotificationService,
  refused: EditRefusal,
  ways: DeleteWaysOut
): void {
  if (refused.actionKind === 'toEdit') {
    notify.refusal('delete.analysis', 'Deleting this is an Edit change.', {
      actions: [{ label: 'Switch to Edit', run: ways.toEdit }],
    });
    return;
  }
  notify.refusal('delete.pose', refused.long, {
    actions: refused.backToStartHelps ? [{ label: 'Return to start', run: ways.toStart }] : [],
  });
}
