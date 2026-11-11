import polygonClipping, { type Polygon, type Ring } from 'polygon-clipping';

export interface CompoundPathGeometry {
  path: string;
  rings: Ring[];
}

interface PointLike {
  x: number;
  y: number;
}

const ARC_STEP = Math.PI / 24;
const QUADRATIC_STEPS = 12;
const CORNER_THRESHOLD = Math.PI / 12;
const EPSILON = 1e-9;

/**
 * The grids a union's vertices are snapped to, finest first.
 *
 * polygon-clipping is exact about coincidence and nothing else: two vertices a
 * hair apart are two vertices, and a pair of edges that cross between them can
 * leave it unable to close a ring. Two bars welded at a pin both end in a cap
 * on the same circle, and flattened at the same angular step their vertices
 * land within 1e-14 of each other -- the Bell Crank's right-angled weld threw
 * "Unable to complete output ring" and drew as two loose bars (#291). Snapping
 * makes those vertices one vertex. The grid is in drawing units, where a joint
 * is tens of units across, so the finest step is far below anything drawn;
 * the coarser ones are only tried if a finer one still fails.
 */
const SNAP_GRIDS = [1e-6, 1e-4, 1e-2];

export function buildCompoundPath(leafPaths: string[], filletRadius: number): CompoundPathGeometry {
  let flattened: Ring[];
  try {
    flattened = leafPaths.map(flattenPath);
  } catch {
    // A malformed legacy leaf must not prevent the mechanism from rendering.
    return { path: leafPaths.join(' '), rings: [] };
  }
  if (flattened.length === 0) return { path: '', rings: [] };
  for (const grid of SNAP_GRIDS) {
    const rings = unionRings(flattened, grid);
    if (rings === undefined) continue;
    if (rings.length === 0) break;
    return {
      path: rings.map((ring) => roundedRingPath(ring, filletRadius)).join(' '),
      rings,
    };
  }
  return { path: leafPaths.join(' '), rings: [] };
}

/** The union of these rings snapped to `grid`, or undefined where the library gives up. */
function unionRings(flattened: Ring[], grid: number): Ring[] | undefined {
  const polygons = flattened.map((ring) => [snapRing(ring, grid)] as Polygon);
  try {
    return polygonClipping.union(polygons[0], ...polygons.slice(1)).flatMap((polygon) => polygon);
  } catch {
    return undefined;
  }
}

function snapRing(ring: Ring, grid: number): Ring {
  const snapped: Ring = [];
  ring.forEach((point) =>
    appendPoint(snapped, [Math.round(point[0] / grid) * grid, Math.round(point[1] / grid) * grid])
  );
  // Snapping can merge the closing point into its neighbor; keep the ring closed.
  const first = snapped[0];
  const last = snapped[snapped.length - 1];
  if (first && last && distance(first, last) > EPSILON) snapped.push([first[0], first[1]]);
  return snapped;
}

/**
 * Several holes as one subtractable outline.
 *
 * A carrier subtracts its channels by appending them to its own path and
 * filling even-odd, which is exactly right for one channel and wrong for two
 * that cross: the crossing is inside both, so it is wound three times, comes
 * out odd, and fills back in — a carrier-colored diamond sitting in the middle
 * of the X with both capsule outlines stroked straight through it. Unioning
 * first turns the pair into a single ring, which even-odd then subtracts whole.
 *
 * One channel is returned untouched, so the ordinary case keeps its exact arcs
 * instead of the polygon a union would flatten it to.
 */
export function mergedChannels(channels: string[]): string {
  if (channels.length < 2) return channels.join(' ');
  // No fillet: a slot is a machined hole, and rounding the corners where two
  // cross would invent a radius the geometry does not have.
  const merged = buildCompoundPath(channels, 0).path;
  return merged || channels.join(' ');
}

/**
 * Move already-built SVG geometry between two poses of the same rigid link.
 * Welded contours only need their Boolean union calculated once; every solved
 * timestep is a rotation and translation of that original contour.
 */
export function transformRigidPath(
  path: string,
  sourceStart: PointLike,
  sourceEnd: PointLike,
  targetStart: PointLike,
  targetEnd: PointLike
): string {
  const tokens = path.match(/[MLHVQAZ]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const output: string[] = [];
  const rotation = rigidRotation(sourceStart, sourceEnd, targetStart, targetEnd);
  let index = 0;
  // Tracked because the shorthand is relative to it, and because a rotation
  // turns a horizontal line into a sloped one: H and V have to come out as L.
  let current: PointLike = { x: 0, y: 0 };

  const number = (): number => {
    const value = Number(tokens[index++]);
    if (!Number.isFinite(value)) throw new Error('Invalid SVG path number');
    return value;
  };
  const place = (at: PointLike): string => {
    current = at;
    const transformed = transformRigidPoint(at, sourceStart, targetStart, rotation);
    return `${formatNumber(transformed.x)} ${formatNumber(transformed.y)}`;
  };
  const point = (): string => place({ x: number(), y: number() });

  while (index < tokens.length) {
    const command = tokens[index++].toUpperCase();
    output.push(command === 'H' || command === 'V' ? 'L' : command);
    switch (command) {
      case 'M':
      case 'L':
        output.push(point());
        break;
      case 'H':
        output.push(place({ x: number(), y: current.y }));
        break;
      case 'V':
        output.push(place({ x: current.x, y: number() }));
        break;
      case 'Q':
        output.push(point(), point());
        break;
      case 'A': {
        const radiusX = number();
        const radiusY = number();
        const axisRotation = number();
        const largeArc = number();
        const sweep = number();
        output.push(
          formatNumber(radiusX),
          formatNumber(radiusY),
          formatNumber(axisRotation + (rotation * 180) / Math.PI),
          formatNumber(largeArc),
          formatNumber(sweep),
          point()
        );
        break;
      }
      case 'Z':
        break;
      default:
        throw new Error(`Unsupported SVG path command: ${command}`);
    }
  }
  return output.join(' ');
}

export function transformRigidCoord(
  point: PointLike,
  sourceStart: PointLike,
  sourceEnd: PointLike,
  targetStart: PointLike,
  targetEnd: PointLike
): [number, number] {
  const transformed = transformRigidPoint(
    point,
    sourceStart,
    targetStart,
    rigidRotation(sourceStart, sourceEnd, targetStart, targetEnd)
  );
  return [transformed.x, transformed.y];
}

function rigidRotation(
  sourceStart: PointLike,
  sourceEnd: PointLike,
  targetStart: PointLike,
  targetEnd: PointLike
): number {
  return (
    Math.atan2(targetEnd.y - targetStart.y, targetEnd.x - targetStart.x) -
    Math.atan2(sourceEnd.y - sourceStart.y, sourceEnd.x - sourceStart.x)
  );
}

function transformRigidPoint(
  point: PointLike,
  sourceStart: PointLike,
  targetStart: PointLike,
  rotation: number
): PointLike {
  const relativeX = point.x - sourceStart.x;
  const relativeY = point.y - sourceStart.y;
  const cosine = Math.cos(rotation);
  const sine = Math.sin(rotation);
  return {
    x: targetStart.x + relativeX * cosine - relativeY * sine,
    y: targetStart.y + relativeX * sine + relativeY * cosine,
  };
}

function flattenPath(path: string): Ring {
  const tokens = path.match(/[MLHVQAZ]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) ?? [];
  const ring: Ring = [];
  let index = 0;
  let current: [number, number] = [0, 0];

  const number = (): number => {
    const value = Number(tokens[index++]);
    if (!Number.isFinite(value)) throw new Error('Invalid SVG path number');
    return value;
  };

  while (index < tokens.length) {
    const command = tokens[index++].toUpperCase();
    if (command === 'Z') break;
    if (command === 'M' || command === 'L') {
      current = [number(), number()];
      appendPoint(ring, current);
      continue;
    }
    // Every rectangle and capsule in the mark system is written with the
    // shorthand, so refusing it meant any union involving one silently fell
    // back to emitting its inputs side by side -- which under an even-odd fill
    // subtracts their overlap instead of joining them.
    if (command === 'H' || command === 'V') {
      current = command === 'H' ? [number(), current[1]] : [current[0], number()];
      appendPoint(ring, current);
      continue;
    }
    // Quadratics are what this module's own output uses for a filleted corner,
    // so refusing them made a compound link impossible to feed back in — and
    // the weld plate does exactly that, unioning a rider that may itself be a
    // welded body with the block it is fused to.
    if (command === 'Q') {
      const control: [number, number] = [number(), number()];
      const end: [number, number] = [number(), number()];
      flattenQuadratic(current, control, end).forEach((point) => appendPoint(ring, point));
      current = end;
      continue;
    }
    if (command === 'A') {
      const radiusX = number();
      const radiusY = number();
      const rotation = number();
      const largeArc = number() !== 0;
      const sweep = number() !== 0;
      const end: [number, number] = [number(), number()];
      flattenArc(current, end, radiusX, radiusY, rotation, largeArc, sweep).forEach((point) =>
        appendPoint(ring, point)
      );
      current = end;
      continue;
    }
    throw new Error(`Unsupported SVG path command: ${command}`);
  }

  if (ring.length < 3) throw new Error('SVG path does not describe a polygon');
  if (distance(ring[0], ring[ring.length - 1]) > EPSILON) {
    ring.push([ring[0][0], ring[0][1]]);
  } else {
    ring[ring.length - 1] = [ring[0][0], ring[0][1]];
  }
  return ring;
}

/** A quadratic Bézier as a polyline, at the resolution arcs are flattened to. */
function flattenQuadratic(
  start: [number, number],
  control: [number, number],
  end: [number, number]
): Ring {
  // A fillet never turns more than a right angle, so the same step an arc uses
  // bounds the error: twelve segments is finer than that everywhere.
  const count = QUADRATIC_STEPS;
  return Array.from({ length: count }, (_, step) => {
    const t = (step + 1) / count;
    const inverse = 1 - t;
    return [
      inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0],
      inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1],
    ] as [number, number];
  });
}

function flattenArc(
  start: [number, number],
  end: [number, number],
  inputRadiusX: number,
  inputRadiusY: number,
  rotationDegrees: number,
  largeArc: boolean,
  sweep: boolean
): Ring {
  let radiusX = Math.abs(inputRadiusX);
  let radiusY = Math.abs(inputRadiusY);
  if (radiusX < EPSILON || radiusY < EPSILON) return [end];

  const rotation = (rotationDegrees * Math.PI) / 180;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const halfX = (start[0] - end[0]) / 2;
  const halfY = (start[1] - end[1]) / 2;
  const transformedX = cos * halfX + sin * halfY;
  const transformedY = -sin * halfX + cos * halfY;
  const scale = Math.sqrt(transformedX ** 2 / radiusX ** 2 + transformedY ** 2 / radiusY ** 2);
  if (scale > 1) {
    radiusX *= scale;
    radiusY *= scale;
  }

  const numerator = Math.max(
    0,
    radiusX ** 2 * radiusY ** 2 -
      radiusX ** 2 * transformedY ** 2 -
      radiusY ** 2 * transformedX ** 2
  );
  const denominator = radiusX ** 2 * transformedY ** 2 + radiusY ** 2 * transformedX ** 2;
  const direction = largeArc === sweep ? -1 : 1;
  const coefficient = direction * Math.sqrt(numerator / Math.max(denominator, EPSILON));
  const centerXPrime = coefficient * ((radiusX * transformedY) / radiusY);
  const centerYPrime = coefficient * (-(radiusY * transformedX) / radiusX);
  const centerX = cos * centerXPrime - sin * centerYPrime + (start[0] + end[0]) / 2;
  const centerY = sin * centerXPrime + cos * centerYPrime + (start[1] + end[1]) / 2;

  const startVector: [number, number] = [
    (transformedX - centerXPrime) / radiusX,
    (transformedY - centerYPrime) / radiusY,
  ];
  const endVector: [number, number] = [
    (-transformedX - centerXPrime) / radiusX,
    (-transformedY - centerYPrime) / radiusY,
  ];
  const startAngle = Math.atan2(startVector[1], startVector[0]);
  let angleDelta = vectorAngle(startVector, endVector);
  if (!sweep && angleDelta > 0) angleDelta -= Math.PI * 2;
  if (sweep && angleDelta < 0) angleDelta += Math.PI * 2;

  const steps = Math.max(1, Math.ceil(Math.abs(angleDelta) / ARC_STEP));
  return Array.from({ length: steps }, (_, step) => {
    const angle = startAngle + (angleDelta * (step + 1)) / steps;
    return [
      centerX + cos * radiusX * Math.cos(angle) - sin * radiusY * Math.sin(angle),
      centerY + sin * radiusX * Math.cos(angle) + cos * radiusY * Math.sin(angle),
    ] as [number, number];
  });
}

function roundedRingPath(ring: Ring, filletRadius: number): string {
  const points = withoutClosingDuplicate(ring);
  if (points.length < 3) return '';
  const corners = points.map((point, index) => {
    const previous = points[(index - 1 + points.length) % points.length];
    const next = points[(index + 1) % points.length];
    const incoming = unitVector(previous, point);
    const outgoing = unitVector(point, next);
    const turn = Math.atan2(
      incoming[0] * outgoing[1] - incoming[1] * outgoing[0],
      incoming[0] * outgoing[0] + incoming[1] * outgoing[1]
    );
    const previousLength = distance(previous, point);
    const nextLength = distance(point, next);
    const tangent =
      Math.abs(turn) < CORNER_THRESHOLD
        ? 0
        : Math.min(filletRadius * Math.tan(Math.abs(turn) / 2), previousLength / 2, nextLength / 2);
    return {
      point,
      before: [point[0] - incoming[0] * tangent, point[1] - incoming[1] * tangent] as [
        number,
        number,
      ],
      after: [point[0] + outgoing[0] * tangent, point[1] + outgoing[1] * tangent] as [
        number,
        number,
      ],
      rounded: tangent > EPSILON,
    };
  });

  let path = `M ${formatPair(corners[0].after)} `;
  for (let index = 1; index <= corners.length; index++) {
    const corner = corners[index % corners.length];
    path += `L ${formatPair(corner.before)} `;
    path += corner.rounded
      ? `Q ${formatPair(corner.point)} ${formatPair(corner.after)} `
      : `L ${formatPair(corner.after)} `;
  }
  return `${path}Z`;
}

function appendPoint(ring: Ring, point: [number, number]): void {
  const last = ring[ring.length - 1];
  if (!last || distance(last, point) > EPSILON) ring.push([point[0], point[1]]);
}

function withoutClosingDuplicate(ring: Ring): Ring {
  return ring.length > 1 && distance(ring[0], ring[ring.length - 1]) <= EPSILON
    ? ring.slice(0, -1)
    : [...ring];
}

function vectorAngle(first: [number, number], second: [number, number]): number {
  return Math.atan2(
    first[0] * second[1] - first[1] * second[0],
    first[0] * second[0] + first[1] * second[1]
  );
}

function unitVector(start: [number, number], end: [number, number]): [number, number] {
  const length = distance(start, end);
  return length <= EPSILON ? [0, 0] : [(end[0] - start[0]) / length, (end[1] - start[1]) / length];
}

function distance(first: [number, number], second: [number, number]): number {
  return Math.hypot(second[0] - first[0], second[1] - first[1]);
}

function formatPair(pair: [number, number]): string {
  return `${formatNumber(pair[0])} ${formatNumber(pair[1])}`;
}

function formatNumber(value: number): string {
  const rounded = Math.abs(value) < EPSILON ? 0 : Number(value.toFixed(9));
  return rounded.toString();
}
