import type { GalleryEntry } from './fixture-gallery';
import { drivenTwoRiderSlotFixture } from './joint-type-fixtures';

/** Changes of joint type on a driven slot, each one click from its URL. */
export const JOINT_TYPE_GALLERY: GalleryEntry[] = [
  {
    name: 'Joint Type: driven slot with two riders',
    purpose:
      'Select B and choose Prismatic: the input stays, and BD and BE fuse into one body riding the slot',
    spec: 'joint-type.service.spec.ts',
    floatingSlot: true,
    fixture: drivenTwoRiderSlotFixture(),
  },
  {
    name: 'Joint Type: driven Prismatic slot',
    purpose: 'Select B: Welded is refused, because the input drives along the slot it would remove',
    spec: 'joint-type.service.spec.ts',
    floatingSlot: true,
    slide: true,
    fixture: drivenTwoRiderSlotFixture({ welded: true }),
  },
];
