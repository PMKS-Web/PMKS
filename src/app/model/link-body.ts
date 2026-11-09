import { Coord } from './coord';
import { RealLink } from './link';
import { UniformBody, uniformBodyOf } from './uniform-body';
import { getDistance } from './utils';

/**
 * The body a link's automatic mass properties come from, and the one answer to
 * "where is its center of mass" that every caller shares.
 *
 * Before this was one function, a drag moved the mark to the average of the
 * link's joints while the commit put it at the shape's centroid, so a tracer
 * point dragged along a bar pulled the mark toward itself and let it snap back
 * on release (issue #156). The drag, the merge, the group move and the
 * property pass all ask here now, and the mark a reader watches during a
 * gesture is the one it settles on.
 */
export interface DerivedBody {
  /** Center of mass, in model coordinates. */
  com: Coord;
  /** Moment of inertia about `com`, in the stored inertia unit. */
  moi: number;
}

/**
 * A primitive link as a uniform body: a disc about its ground pin when it is
 * drawn as one, and otherwise the rod or hull plate `uniformBodyOf` describes.
 *
 * The disc is the shape the reader sees, so it is the shape the physics uses.
 * Its radius is the reach of its farthest joint from the pin -- the skeleton,
 * like every other idealization, not the drawn edge, which also carries the
 * bar's display half-width and would make inertia depend on Object Size.
 */
export function primitiveBodyOf(link: RealLink): UniformBody {
  const center = link.discCenter();
  if (center === undefined) return uniformBodyOf(link.joints);
  const reach = link.joints.reduce((far, joint) => Math.max(far, getDistance(center, joint)), 0);
  return { centroid: new Coord(center.x, center.y), gyrationSq: reach ** 2 / 2 };
}

/**
 * The uniform body a link derives its automatic properties from.
 *
 * A compound is the *sum of its parts* -- each member as its own body,
 * combined by the parallel-axis theorem -- never a plate over the whole hull:
 * a V-shaped weld is two bars, and a plate spanning the crook would weigh
 * material that is not there. Members somebody typed at contribute the numbers
 * they were given. `inertiaFactor` converts mass x (model length)^2 into the
 * stored inertia unit; a caller after the center alone may leave it at 1.
 */
export function derivedBodyOf(link: RealLink, inertiaFactor = 1): DerivedBody {
  if (link.subset.length === 0) {
    const body = primitiveBodyOf(link);
    return {
      com: new Coord(body.centroid.x, body.centroid.y),
      moi: link.mass * body.gyrationSq * inertiaFactor,
    };
  }
  const parts = link.subset
    .filter((member): member is RealLink => member instanceof RealLink)
    .map((member) => {
      const own = derivedBodyOf(member, inertiaFactor);
      return {
        mass: member.mass,
        com: member.comIsCustom ? new Coord(member.CoM.x, member.CoM.y) : own.com,
        moi: member.moiIsCustom ? member.massMoI : own.moi,
      };
    });
  const totalMass = parts.reduce((sum, part) => sum + part.mass, 0);
  // Massless members still have to put the mark somewhere: their plain mean.
  const weight = (mass: number) => (totalMass > 0 ? mass / totalMass : 1 / parts.length);
  const com =
    parts.length === 0
      ? uniformBodyOf(link.joints).centroid
      : new Coord(
          parts.reduce((sum, part) => sum + weight(part.mass) * part.com.x, 0),
          parts.reduce((sum, part) => sum + weight(part.mass) * part.com.y, 0)
        );
  const moi = parts.reduce(
    (sum, part) =>
      sum +
      part.moi +
      part.mass * ((part.com.x - com.x) ** 2 + (part.com.y - com.y) ** 2) * inertiaFactor,
    0
  );
  return { com, moi };
}

/** Where a link's automatic center of mass is. */
export function derivedCenterOfMass(link: RealLink): Coord {
  return derivedBodyOf(link).com;
}
