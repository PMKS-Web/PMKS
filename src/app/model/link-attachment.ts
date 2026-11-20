import { RealLink } from './link';

/** A compound selection does not identify which primitive receives an attachment. */
export function compoundAttachmentRefusal(link: RealLink) {
  return link.isWelded && link.lastSelectedSublink == null
    ? {
        short: 'pick a sub-link',
        long: 'This is a welded compound. Click one of the links it is made of, so the new member knows which body it joins.',
      }
    : undefined;
}
