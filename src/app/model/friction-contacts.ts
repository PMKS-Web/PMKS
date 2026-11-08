import { PrisJoint, RealJoint } from './joint';
import { RealLink } from './link';
import { hasFriction } from './joint-friction';

export function frictionContactName(joint: RealJoint): string {
  return joint.name || joint.id;
}

/** A guide couple needs separated bearing loads before Coulomb friction can be inferred. */
export function guideFrictionRefusal(joint: RealJoint): string | undefined {
  return joint instanceof PrisJoint && !joint.rotates
    ? `Guide ${joint.name} carries a couple. Its friction needs bearing spacing and contact loads, which this model does not yet support.`
    : undefined;
}

export function frictionContactsOf(joint: RealJoint): RealJoint[] {
  if (joint instanceof PrisJoint) return [joint];
  const simplePin =
    !joint.isWelded &&
    (joint.ground
      ? joint.links.length === 1 && joint.links[0] instanceof RealLink
      : joint.links.length === 2 && joint.links.every((link) => link instanceof RealLink));
  return simplePin || hasFriction(joint.friction) ? [joint] : [];
}
