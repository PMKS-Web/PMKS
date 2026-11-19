import { RealJoint } from '../../model/joint';
import { NotificationService } from '../../services/notification.service';

/**
 * The joint a force drag is being held short of, and the one refusal said about it.
 *
 * The joint is ringed red for as long as the hand is over it, the same ring a
 * joint drop that will be refused wears. The reason is said once: the
 * notification service holds a repeat while one is up, so saying it on every
 * pointer move does not stack it. Each joint gets its own message, and the last
 * joint's is taken down, so a hand that passes one refused pin on its way to
 * another is told about the one it is over, which a single shared id held back
 * as a repeat.
 */
export class ForceRefusalNotice {
  /** The joint ringed red, read by the canvas template. */
  joint?: RealJoint;

  /** The id of the last refusal said, to take down when another replaces it. */
  private said?: string;

  constructor(private readonly notify: NotificationService) {}

  /** Ring `joint` and say `text` about it. */
  refuse(joint: RealJoint, text: string): void {
    this.joint = joint;
    const id = `force.refused-joint.${joint.id}`;
    if (this.said && this.said !== id) this.notify.dismissId(this.said);
    this.said = id;
    this.notify.refusal(id, text);
  }

  /** The hand has left the joint: the ring goes, and the message stays up for its time. */
  clearRing(): void {
    this.joint = undefined;
  }

  /** The drag is over, so the next one starts with nothing ringed and nothing said. */
  forget(): void {
    this.joint = undefined;
    this.said = undefined;
  }
}
