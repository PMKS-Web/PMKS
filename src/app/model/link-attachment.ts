import { RealLink } from './link';

/** A compound selection does not identify which primitive receives an attachment. */
export function compoundAttachmentRefusal(link: RealLink) {
  return link.isWelded && link.lastSelectedSublink == null
    ? {
        short: 'pick a sub-link',
        long: 'This is a welded compound link. Click one of its individual links to choose where to attach.',
      }
    : undefined;
}
