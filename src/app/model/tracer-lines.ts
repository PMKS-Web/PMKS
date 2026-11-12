import { Joint, PrisJoint, RevJoint } from './joint';
import { Link, RealLink } from './link';
import { linesThrough, SnapLine } from './line-snap';
import { SnapPoint } from './axis-snap';

/**
 * The lines a tracer point may snap onto: through each pair of the other
 * joints of the bar it rides (#307).
 *
 * A tracer is a free revolute pin on exactly one body that has at least two
 * other joints; anything else gets no lines, so its drag falls through to the
 * grid and the axis snap as before. In a welded compound the tracer's
 * `links[0]` is the whole compound, so the lines come from the bar in its
 * subset that holds it -- not from two joints of different bars that happen
 * to be welded together. A cylinder's members are never tracer bodies.
 */
export function tracerLines(joint: Joint, isCylinderMember: (link: Link) => boolean): SnapLine[] {
  if (!(joint instanceof RevJoint) || joint.ground || joint.input) return [];
  if (joint.links.length !== 1) return [];
  const root = joint.links[0];
  if (!(root instanceof RealLink)) return [];
  const body = root.subset.find((leaf) => leaf.joints.some((one) => one.id === joint.id)) ?? root;
  if (isCylinderMember(body) || body.joints.length < 3) return [];
  return linesThrough(body.joints.filter((other) => other.id !== joint.id));
}

/**
 * What a dragged tracer may snap to: its bar's lines, and every other pin
 * whose axis may square it up along them. A slider is not a pin to square
 * against, as in the axis snap.
 */
export function tracerSnapTargets(
  joint: Joint,
  joints: Joint[],
  isCylinderMember: (link: Link) => boolean
): { lines: SnapLine[]; others: SnapPoint[] } {
  const lines = tracerLines(joint, isCylinderMember);
  if (!lines.length) return { lines, others: [] };
  const others = joints.filter((other) => other.id !== joint.id && !(other instanceof PrisJoint));
  return { lines, others };
}
