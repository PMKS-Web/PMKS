/**
 * Which joints a force may sit on, and where a force that is on one goes.
 *
 * A force acts on one body. At a joint that belongs to one link only -- a
 * tracer point out at the end of a boom -- that body is the link, and a load
 * there is an ordinary thing to draw. Where a second body meets the link, the
 * load no longer says which of the two carries it, and every answer the force
 * solver could pick is a guess the reader never made. Ground is such a body:
 * a grounded pin joins its link to the frame, so a load on it may be the
 * link's or the frame's (issue #138). So is the slot a slider rides, whether
 * it is cut in a bar or fixed to the ground.
 *
 * Every door a force comes in by asks this: the anchor drag, the joint menu's
 * Attach Force row, a new force, and the rebuild every edit ends in. The last
 * one is what catches a force that was legal when it was placed and stopped
 * being legal later -- a tracer point merged onto another joint, a link
 * attached to it, Grounded turned on -- and a URL or a library drawing that
 * arrived with a load on a pin. It moves the force a short way along its link
 * rather than refusing the edit, because the edit is what the reader asked for
 * and the force's exact spot is the smaller thing to give up.
 */
import { Coord } from './coord';
import { constrainForceAnchor } from './force-anchor';
import { Joint, PrisJoint, RealJoint } from './joint';
import { RealLink } from './link';

/** Why a force may not sit on a joint, in the menu's short form and its long one. */
export interface ForceOnJointRefusal {
  code: 'shared' | 'grounded' | 'slider';
  /** The menu's few words: `2 links share it`. */
  short: string;
  /** Why, as a clause that follows "A force cannot sit on joint O:". */
  because: string;
  /** The menu's sentence. */
  long: string;
}

/** How a force anchored on a refused joint is moved, and how far. */
export interface ForceOffJoint {
  joint: RealJoint;
  to: Coord;
}

/** Why a force may not sit on `joint`, or undefined when it may. */
export function refuseForceOnJoint(joint: Joint): ForceOnJointRefusal | undefined {
  if (!(joint instanceof RealJoint)) return undefined;
  const links = joint.links.filter((link) => link instanceof RealLink).length;
  if (links > 1) {
    return refusal(
      joint,
      'shared',
      `${links} links share it`,
      `${links} links meet there, so the force would not say which one carries it`
    );
  }
  if (joint instanceof PrisJoint) {
    return refusal(
      joint,
      'slider',
      'a slider shares it',
      'the joint slides, so the force would not say whether the link or the slider carries it'
    );
  }
  if (joint.ground) {
    return refusal(
      joint,
      'grounded',
      'it is grounded',
      'the joint is grounded, so the force would not say whether the link or the ground carries it'
    );
  }
  return undefined;
}

function refusal(
  joint: Joint,
  code: ForceOnJointRefusal['code'],
  short: string,
  because: string
): ForceOnJointRefusal {
  return {
    code,
    short,
    because,
    long: `A force cannot sit on joint ${joint.id}: ${because}. Attach it to the link, away from the joint.`,
  };
}

/**
 * The refused joint of `link` that `point` is on, if any: within `within` of
 * its center. The nearest one, should two be that close.
 *
 * `within` is a size on the drawing, the pin's own radius, and a short link
 * can be smaller than that; so it is capped at a quarter of the way to the
 * pin's furthest neighbor on its piece, which leaves most of a short bar free
 * and keeps the point `holdOffJoint` moves a force to from counting as on the
 * pin.
 */
export function refusedJointAt(
  link: RealLink,
  point: { x: number; y: number },
  within: number
): RealJoint | undefined {
  let nearest: RealJoint | undefined;
  let nearestGap = Infinity;
  for (const joint of link.joints) {
    if (!(joint instanceof RealJoint) || !refuseForceOnJoint(joint)) continue;
    const gap = Math.hypot(joint.x - point.x, joint.y - point.y);
    const furthest = Math.max(0, ...waysOff(link, joint, Infinity).map((way) => way.reach));
    if (gap < Math.min(within, furthest / 4) && gap < nearestGap) {
      nearest = joint;
      nearestGap = gap;
    }
  }
  return nearest;
}

/**
 * The same point, moved `margin` away from `pin` into the link it is on.
 *
 * Along one of the ways into the link -- toward another of its joints, or on a
 * plate toward its middle -- and never past halfway along it, so a short bar
 * does not carry the load onto the joint at its other end. Of the ways that
 * get a fair distance off the pin, the one that lands nearest `point`: the
 * side of the pin the hand came from, so a pin halfway along a boom does not
 * throw the load to the far half. Then kept to the link's region, as every
 * anchor is.
 */
export function holdOffJoint(
  link: RealLink,
  pin: RealJoint,
  point: { x: number; y: number },
  margin: number
): Coord {
  const gap = Math.hypot(point.x - pin.x, point.y - pin.y);
  if (gap >= margin) return constrainForceAnchor(link, point, 0);
  const ways = waysOff(link, pin, margin);
  const longest = Math.max(0, ...ways.map((way) => way.step));
  if (!(longest > 1e-12)) return constrainForceAnchor(link, point, 0);
  let best: Coord | undefined;
  let bestGap = Infinity;
  for (const way of ways.filter((one) => one.step >= longest / 2)) {
    const held = constrainForceAnchor(
      link,
      { x: pin.x + way.dx * way.step, y: pin.y + way.dy * way.step },
      0
    );
    const fromPoint = Math.hypot(held.x - point.x, held.y - point.y);
    if (fromPoint < bestGap - 1e-12) {
      best = held;
      bestGap = fromPoint;
    }
  }
  return best ?? constrainForceAnchor(link, point, 0);
}

/**
 * Where a force anchored at `point` on `link` has to go, if it is sitting on
 * a joint that refuses it; undefined when it may stay.
 *
 * `within` is how close to a pin counts as on it, and `margin` how far off it
 * the force is put. Pure, so the rebuild can say what it did after doing it.
 */
export function forceOffRefusedJoint(
  link: RealLink,
  point: { x: number; y: number },
  within: number,
  margin: number
): ForceOffJoint | undefined {
  const joint = refusedJointAt(link, point, within);
  if (!joint) return undefined;
  return { joint, to: holdOffJoint(link, joint, point, margin) };
}

/** One way off a pin into its piece: a unit direction, how far it runs, and how far a force goes. */
interface WayOff {
  dx: number;
  dy: number;
  reach: number;
  step: number;
}

/**
 * The ways off `pin` into the piece of `link` that holds it -- a compound's
 * member, else the link: toward each of the piece's other joints, and on a
 * plate toward its middle, which points into the plate rather than along an
 * edge. Each goes `margin`, or half its reach if that is less.
 */
function waysOff(link: RealLink, pin: RealJoint, margin: number): WayOff[] {
  const pieces = link.subset.filter((piece): piece is RealLink => piece instanceof RealLink);
  const piece = pieces.find((one) => one.joints.includes(pin)) ?? link;
  const others = piece.joints.filter(
    (joint) => Math.hypot(joint.x - pin.x, joint.y - pin.y) > 1e-9
  );
  // The middle first, so a force exactly on a plate's corner, with every way
  // as near as every other, goes into the plate rather than along an edge.
  // The pin counts toward the middle, so the way points inward.
  const targets: { x: number; y: number }[] = [];
  if (others.length >= 2) {
    const all = [pin, ...others];
    targets.push({
      x: all.reduce((sum, joint) => sum + joint.x, 0) / all.length,
      y: all.reduce((sum, joint) => sum + joint.y, 0) / all.length,
    });
  }
  targets.push(...others);
  return targets.flatMap((target) => {
    const dx = target.x - pin.x;
    const dy = target.y - pin.y;
    const reach = Math.hypot(dx, dy);
    if (!(reach > 1e-9)) return [];
    return [{ dx: dx / reach, dy: dy / reach, reach, step: Math.min(margin, reach / 2) }];
  });
}
