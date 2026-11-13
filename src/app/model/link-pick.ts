import { Link, RealLink } from './link';
import { selectableLinks } from './selection';

/**
 * A click on a welded body names the body.
 *
 * It used to name the body first and then, on a second click, the member bar
 * under the pointer. Since a compound has one density (#279) a member has no
 * mass, color or center of its own worth setting, and the one number left on
 * it -- the length between two of its joints -- is in the joint's Distance to
 * Joints rows, with a padlock. So the second click went.
 *
 * Except on a cylinder welded into the body: its barrel and rod have lengths
 * of their own that are not a distance between two joints a reader can see,
 * so a second click still reaches the member it lands on.
 */
export function pickLink(
  roots: Link[],
  clicked: RealLink,
  selected: RealLink | undefined,
  containsPoint: (link: RealLink) => boolean,
  isCylinderMember: (link: RealLink) => boolean = () => false
): RealLink {
  const root = roots.find((link) => selectableLinks([link]).includes(clicked));
  if (!(root instanceof RealLink) || !root.isCompound) return clicked;
  const members = selectableLinks([root]);
  if (!selected || !members.includes(selected)) return root;
  const cylinderMembers = members.filter((link) => !link.isCompound && isCylinderMember(link));
  if (!clicked.isCompound) return cylinderMembers.includes(clicked) ? clicked : root;
  return [...cylinderMembers].reverse().find(containsPoint) ?? root;
}
