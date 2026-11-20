import { PrisJoint, RealJoint } from './joint';
import { Link, RealLink } from './link';
import { holdableBar } from './link-holds';
import { selectableLinks } from './selection';

/**
 * One row of a joint's Distance to Joints: the joint it measures to, and the
 * welded bar joining the two when there is one.
 *
 * The bar is what a padlock on the row holds. A hold is a pair of joints kept
 * apart, and the only pairs offered one are the two ends of one bar, so the
 * padlock always reads as "this bar keeps its length". Two joints at opposite
 * ends of a chain of bars are never offered one: what would hold them is not
 * a part anybody can point at.
 */
export interface DistanceNeighbor {
  joint: RealJoint;
  bar?: RealLink;
}

/**
 * The joints a selected joint is measured to.
 *
 * Only its neighbors, never every joint on the body. Along a welded body made
 * of bars, a joint lists the joints at the other end of each bar it is on --
 * in a chain of three bars the end joint lists the next one, and a middle
 * joint lists the one on either side. On a plate of three or more joints it
 * lists the plate's other joints, which are all one rigid shape. A plain bar
 * on its own lists nothing: its Length and Angle are on the link's panel.
 *
 * A cylinder's members are left out; their lengths are not the distance
 * between two joints a reader can see.
 */
export function distanceNeighbors(
  selected: RealJoint,
  roots: Link[],
  isCylinderMember: (link: RealLink) => boolean
): DistanceNeighbor[] {
  const found = new Map<RealJoint, DistanceNeighbor>();
  const offer = (joint: RealJoint, bar?: RealLink) => {
    if (joint === selected || joint instanceof PrisJoint) return;
    // A bar wins over a plate that happens to share the pair: the row can then
    // hold its length.
    if (!found.has(joint) || bar) found.set(joint, { joint, bar });
  };
  for (const root of roots) {
    const leaves = selectableLinks([root]).filter(
      (link) => !link.isCompound && link.joints.includes(selected) && !isCylinderMember(link)
    );
    for (const leaf of leaves) {
      const others = leaf.joints.filter((joint): joint is RealJoint => joint instanceof RealJoint);
      if (leaf.joints.length >= 3) others.forEach((joint) => offer(joint));
      else if (leaf !== root && holdableBar(leaf)) others.forEach((joint) => offer(joint, leaf));
    }
  }
  return [...found.values()];
}
