/**
 * A small Verlet solver: points that remember where they were, and distance constraints
 * that pull them back into a chain.
 *
 * Adapted from Liam Egan's "Strings" CodePen (https://codepen.io/shubniggurath/pen/xbwOJye,
 * MIT). His structure is the one used here: a column of points pinned at the top, vertical
 * distance constraints relaxed over several passes, gravity plus damping, and a radial
 * pointer force. The integration below is rewritten against a fixed timestep so the
 * curtain behaves the same on a 60Hz and a 144Hz display.
 *
 * No DOM, no framework: this file is pure maths so it can be reasoned about and tested on
 * its own.
 */

export type VerletPoint = {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  /** A pinned point ignores forces and integration. The eave holds it. */
  isPinned: boolean;
};

export type DistanceConstraint = {
  firstIndex: number;
  secondIndex: number;
  restLength: number;
};

export function createPoint(x: number, y: number, isPinned = false): VerletPoint {
  return { x, y, previousX: x, previousY: y, isPinned };
}

/**
 * Moves a point forward one step. Verlet derives velocity from the gap between the current
 * and previous position, which is why an impulse is applied by displacing the point rather
 * than by storing a velocity vector.
 */
export function integratePoint(
  point: VerletPoint,
  accelerationX: number,
  accelerationY: number,
  timestepSeconds: number,
  damping: number,
): void {
  if (point.isPinned) {
    return;
  }

  const velocityX = (point.x - point.previousX) * damping;
  const velocityY = (point.y - point.previousY) * damping;

  point.previousX = point.x;
  point.previousY = point.y;

  point.x += velocityX + accelerationX * timestepSeconds * timestepSeconds;
  point.y += velocityY + accelerationY * timestepSeconds * timestepSeconds;
}

/**
 * Pulls two points back to their rest length, splitting the correction between them unless
 * one is pinned, in which case the free one absorbs all of it.
 */
export function relaxConstraint(
  constraint: DistanceConstraint,
  points: readonly VerletPoint[],
): void {
  const first = points[constraint.firstIndex];
  const second = points[constraint.secondIndex];
  if (first === undefined || second === undefined) {
    return;
  }

  const deltaX = second.x - first.x;
  const deltaY = second.y - first.y;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance === 0) {
    return;
  }

  const difference = (distance - constraint.restLength) / distance;
  const correctionX = deltaX * 0.5 * difference;
  const correctionY = deltaY * 0.5 * difference;

  if (first.isPinned && second.isPinned) {
    return;
  }

  if (first.isPinned) {
    second.x -= correctionX * 2;
    second.y -= correctionY * 2;
    return;
  }

  if (second.isPinned) {
    first.x += correctionX * 2;
    first.y += correctionY * 2;
    return;
  }

  first.x += correctionX;
  first.y += correctionY;
  second.x -= correctionX;
  second.y -= correctionY;
}

/**
 * A radial push away from an origin, falling off to nothing at `radius`.
 * Returns the acceleration to add for this point, in px per second squared.
 */
export function computeRadialForce(
  point: VerletPoint,
  originX: number,
  originY: number,
  radius: number,
  strength: number,
): { x: number; y: number } {
  const deltaX = point.x - originX;
  const deltaY = point.y - originY;
  const distance = Math.hypot(deltaX, deltaY);

  if (distance === 0 || distance > radius) {
    return { x: 0, y: 0 };
  }

  // Squared falloff: the push is firm at the pointer and gone well before the edge, so
  // strands part around the cursor instead of the whole curtain heaving.
  const falloff = (1 - distance / radius) ** 2;
  return {
    x: (deltaX / distance) * strength * falloff,
    y: (deltaY / distance) * strength * falloff * 0.35,
  };
}
