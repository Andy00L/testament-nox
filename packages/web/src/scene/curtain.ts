import {
  BEAD_POSITIONS,
  BEAD_RADIUS_PX,
  BEAD_STAGGER_RANGE,
  BREEZE_FREQUENCY_HZ,
  BREEZE_PHASE_PER_STRAND,
  BREEZE_STRENGTH_PX_PER_S2,
  CHARGE_STRENGTH_PX_PER_S2,
  CONSTRAINT_ITERATIONS,
  EAVE_HEIGHT_RATIO,
  FIXED_TIMESTEP_SECONDS,
  GRAVITY_PX_PER_S2,
  GUST_STRENGTH_PX_PER_S2,
  GUST_SWEEP_SECONDS,
  GUST_WIDTH_RATIO,
  MAX_STEPS_PER_FRAME,
  MOBILE_BREAKPOINT_PX,
  POINTER_RADIUS_PX,
  POINTER_STRENGTH_PX_PER_S2,
  RELEASE_FALL_SPEED_PX_PER_S,
  RELEASE_STAGGER_SECONDS,
  RIPPLE_RADIUS_PX,
  RIPPLE_STRENGTH_PX,
  SEGMENTS_PER_STRAND,
  STRAND_ALPHA,
  STRAND_COUNT_DESKTOP,
  STRAND_COUNT_MOBILE,
  STRAND_LENGTH_RATIO,
  STRAND_LENGTH_VARIANCE,
  STRAND_WIDTH_BOTTOM_PX,
  STRAND_STRIKE_COOLDOWN_MS,
  STRAND_WIDTH_TOP_PX,
  STRIKE_VERTICAL_REACH_PX,
  VELOCITY_DAMPING,
} from "./constants.ts";
import {
  computeRadialForce,
  createPoint,
  integratePoint,
  relaxConstraint,
  type DistanceConstraint,
  type VerletPoint,
} from "./verlet.ts";

/**
 * The curtain: a row of hanging chains that also happens to be the product's status
 * display. Warm bronze and a moving breeze mean the heartbeat is recent. As the silence
 * runs on the strands cool toward iron and the air goes still. Released, they let go of
 * the eave and fall out of frame. There is no countdown widget anywhere in this product
 * because this is the countdown.
 */

export type CurtainPalette = {
  bronze: string;
  bronzeDeep: string;
  iron: string;
};

export type CurtainMood = {
  /** 0 while the heartbeat is fresh, 1 at the deadline. Drives colour and breeze. */
  silence: number;
  /** Once true the strands detach, in a staggered wave, and fall. */
  isReleased: boolean;
};

type Strand = {
  points: VerletPoint[];
  constraints: DistanceConstraint[];
  /** Horizontal rest position, used for the breeze phase. Unit: CSS px. */
  anchorX: number;
  /** Shift applied to this strand's beads so they never align into a row. */
  beadOffset: number;
  /** Which side the pointer was last on, so a crossing can be detected. */
  lastPointerSide: number;
  /** performance.now() of the last chime from this strand. Unit: milliseconds. */
  lastStruckAt: number;
  /** Seconds after release at which this strand lets go of the eave. */
  detachDelaySeconds: number;
  hasDetached: boolean;
};

type PointerState = {
  x: number;
  y: number;
  isInside: boolean;
};

type Gust = {
  /** Seconds since the gust started, or null when no gust is running. */
  elapsedSeconds: number;
} | null;

export type CurtainScene = ReturnType<typeof createCurtainScene>;

export function createCurtainScene(palette: CurtainPalette) {
  let width = 0;
  let height = 0;
  let eaveY = 0;
  let strands: Strand[] = [];
  let elapsedSeconds = 0;
  let releasedForSeconds = 0;
  let accumulatorSeconds = 0;
  let strandGradient: CanvasGradient | null = null;
  let gradientSilenceKey = -1;

  const pointer: PointerState = { x: 0, y: 0, isInside: false };
  let gust: Gust = null;
  let mood: CurtainMood = { silence: 0, isReleased: false };
  /** 0 to 1 while the heartbeat control is held. The curtain leaning is the charge meter. */
  let charge = 0;
  /** True while settling before the first paint, so the curtain hangs straight to start. */
  let isSettling = false;
  /**
   * Called when the pointer passes through a strand. The scene knows nothing about audio;
   * it reports the event and whoever cares decides what to do with it.
   */
  let onStrandStruck: ((brightness: number) => void) | null = null;

  function resize(nextWidth: number, nextHeight: number): void {
    width = nextWidth;
    height = nextHeight;
    // Pinned just inside the roof band, so the strands emerge from under the building.
    eaveY = Math.round(height * EAVE_HEIGHT_RATIO);
    build();
    strandGradient = null;
  }

  function build(): void {
    const strandCount = width <= MOBILE_BREAKPOINT_PX ? STRAND_COUNT_MOBILE : STRAND_COUNT_DESKTOP;
    const strandLength = height * STRAND_LENGTH_RATIO;
    const segmentLength = strandLength / (SEGMENTS_PER_STRAND - 1);
    // Half a gap of inset on each side, so the first and last strands are not glued to
    // the viewport edge.
    const gap = width / strandCount;

    strands = Array.from({ length: strandCount }, (_unused, strandIndex) => {
      const anchorX = gap * (strandIndex + 0.5);
      const points: VerletPoint[] = [];
      const constraints: DistanceConstraint[] = [];

      // Deterministic, so the curtain is the same one on every reload and no Math.random
      // sits in a render path. Two coprime multipliers keep neighbours from pairing up.
      const lengthFactor =
        1 + ((((strandIndex * 29) % 17) / 17) - 0.5) * STRAND_LENGTH_VARIANCE;
      const strandSegmentLength = segmentLength * lengthFactor;

      for (let pointIndex = 0; pointIndex < SEGMENTS_PER_STRAND; pointIndex += 1) {
        points.push(
          createPoint(anchorX, eaveY + strandSegmentLength * pointIndex, pointIndex === 0),
        );
        if (pointIndex > 0) {
          constraints.push({
            firstIndex: pointIndex - 1,
            secondIndex: pointIndex,
            restLength: strandSegmentLength,
          });
        }
      }

      return {
        points,
        constraints,
        anchorX,
        // Deterministic rather than random: the same curtain every reload, and no
        // Math.random in a render path.
        beadOffset: (((strandIndex * 37) % 13) / 13 - 0.5) * BEAD_STAGGER_RANGE,
        lastPointerSide: 0,
        lastStruckAt: 0,
        // The wave starts at the middle of the curtain and travels outward, so the fall
        // reads as one event rather than a left-to-right wipe.
        detachDelaySeconds:
          Math.abs(strandIndex - (strandCount - 1) / 2) * RELEASE_STAGGER_SECONDS,
        hasDetached: false,
      };
    });
  }

  function setMood(nextMood: CurtainMood): void {
    const wasReleased = mood.isReleased;
    mood = nextMood;
    if (nextMood.isReleased && !wasReleased) {
      releasedForSeconds = 0;
      for (const strand of strands) {
        strand.hasDetached = false;
      }
    }
  }

  function setPointer(x: number, y: number): void {
    pointer.x = x;
    pointer.y = y;
    pointer.isInside = true;
    detectStrikes();
  }

  /** Reports a strand the pointer has just crossed, at most once per cooldown. */
  function setStrandStruckListener(listener: ((brightness: number) => void) | null): void {
    onStrandStruck = listener;
  }

  /**
   * A strike is the pointer crossing a strand, not merely being near one: the side of the
   * strand the pointer sits on has to flip. That makes a sweep through the curtain ring
   * every cord it actually passes through, and a cursor resting beside one stay silent.
   */
  function detectStrikes(): void {
    if (onStrandStruck === null || mood.isReleased) {
      return;
    }
    const now = performance.now();

    for (const strand of strands) {
      const reference = strand.points[Math.floor(strand.points.length / 2)];
      if (reference === undefined) {
        continue;
      }
      if (Math.abs(pointer.y - reference.y) > STRIKE_VERTICAL_REACH_PX) {
        strand.lastPointerSide = 0;
        continue;
      }

      const side = Math.sign(pointer.x - reference.x);
      const previousSide = strand.lastPointerSide;
      strand.lastPointerSide = side;

      const hasCrossed = previousSide !== 0 && side !== 0 && side !== previousSide;
      if (!hasCrossed || now - strand.lastStruckAt < STRAND_STRIKE_COOLDOWN_MS) {
        continue;
      }
      strand.lastStruckAt = now;
      // Strands further left ring lower, further right ring higher, so sweeping across
      // the curtain plays a run rather than a random scatter.
      onStrandStruck(width === 0 ? 0.5 : reference.x / width);
    }
  }

  function clearPointer(): void {
    pointer.isInside = false;
  }

  /** Sends one gust across the curtain. The heartbeat's visible half. */
  function sendGust(): void {
    gust = { elapsedSeconds: 0 };
  }

  /** Holds a steady wind while the heartbeat control is pressed. 0 releases it. */
  function setCharge(amount: number): void {
    charge = Math.min(1, Math.max(0, amount));
  }

  /**
   * A single local impulse, as if something touched the curtain at one point.
   *
   * Distinct from a gust on purpose: a gust sweeps the whole width and means a heartbeat,
   * a ripple is local and means a line was just added to the will. One direction per
   * meaning, so the two gestures never trade places.
   */
  function rippleAt(originX: number, originY: number): void {
    for (const strand of strands) {
      for (const point of strand.points) {
        if (point.isPinned) {
          continue;
        }
        const push = computeRadialForce(
          point,
          originX,
          originY,
          RIPPLE_RADIUS_PX,
          RIPPLE_STRENGTH_PX,
        );
        // Applied as a displacement rather than an acceleration: in Verlet, moving a point
        // without moving its history is exactly an impulse.
        point.x += push.x;
        point.y += push.y;
      }
    }
  }

  function step(timestepSeconds: number): void {
    elapsedSeconds += timestepSeconds;

    if (mood.isReleased) {
      releasedForSeconds += timestepSeconds;
    }

    if (gust !== null) {
      gust.elapsedSeconds += timestepSeconds;
      if (gust.elapsedSeconds > GUST_SWEEP_SECONDS) {
        gust = null;
      }
    }

    // The breeze dies down as the silence lengthens: the air itself is the timer.
    const breezeStrength = isSettling ? 0 : BREEZE_STRENGTH_PX_PER_S2 * (1 - mood.silence * 0.86);
    const gustCentreX = gust === null ? 0 : (gust.elapsedSeconds / GUST_SWEEP_SECONDS) * width;
    const gustWidth = width * GUST_WIDTH_RATIO;

    for (const strand of strands) {
      if (mood.isReleased && !strand.hasDetached && releasedForSeconds >= strand.detachDelaySeconds) {
        strand.hasDetached = true;
        const anchorPoint = strand.points[0];
        if (anchorPoint !== undefined) {
          anchorPoint.isPinned = false;
          // Displace backwards to give the point downward velocity: in Verlet, position
          // history is the velocity.
          anchorPoint.previousY = anchorPoint.y - RELEASE_FALL_SPEED_PX_PER_S * timestepSeconds;
        }
      }

      const breezePhase =
        elapsedSeconds * BREEZE_FREQUENCY_HZ * Math.PI * 2 +
        strand.anchorX * BREEZE_PHASE_PER_STRAND * 0.01;
      const breezeX = Math.sin(breezePhase) * breezeStrength;

      let gustX = 0;
      if (gust !== null) {
        const distanceToGust = Math.abs(strand.anchorX - gustCentreX);
        if (distanceToGust < gustWidth) {
          const falloff = 1 - distanceToGust / gustWidth;
          gustX = GUST_STRENGTH_PX_PER_S2 * falloff * falloff;
        }
      }

      for (let pointIndex = 1; pointIndex < strand.points.length; pointIndex += 1) {
        const point = strand.points[pointIndex];
        if (point === undefined) {
          continue;
        }

        // Points further from the eave catch more air, the way a real strand does.
        const airCatch = pointIndex / (strand.points.length - 1);
        const chargeX = charge * CHARGE_STRENGTH_PX_PER_S2;
        let accelerationX = (breezeX + gustX + chargeX) * airCatch;
        let accelerationY = GRAVITY_PX_PER_S2;

        if (pointer.isInside && !mood.isReleased) {
          const push = computeRadialForce(
            point,
            pointer.x,
            pointer.y,
            POINTER_RADIUS_PX,
            POINTER_STRENGTH_PX_PER_S2,
          );
          accelerationX += push.x;
          accelerationY += push.y;
        }

        integratePoint(point, accelerationX, accelerationY, timestepSeconds, VELOCITY_DAMPING);
      }

      for (let iteration = 0; iteration < CONSTRAINT_ITERATIONS; iteration += 1) {
        for (const constraint of strand.constraints) {
          relaxConstraint(constraint, strand.points);
        }
      }
    }
  }

  /** Advances the simulation by real elapsed time, in fixed steps. */
  function advance(deltaSeconds: number): void {
    accumulatorSeconds += Math.min(deltaSeconds, FIXED_TIMESTEP_SECONDS * MAX_STEPS_PER_FRAME);
    let stepsTaken = 0;
    while (accumulatorSeconds >= FIXED_TIMESTEP_SECONDS && stepsTaken < MAX_STEPS_PER_FRAME) {
      step(FIXED_TIMESTEP_SECONDS);
      accumulatorSeconds -= FIXED_TIMESTEP_SECONDS;
      stepsTaken += 1;
    }
  }

  function resolveStrandGradient(context: CanvasRenderingContext2D): CanvasGradient {
    // Rebuilt only when the mood moves a visible amount, not every frame.
    const silenceKey = Math.round(mood.silence * 24);
    if (strandGradient !== null && silenceKey === gradientSilenceKey) {
      return strandGradient;
    }

    const gradient = context.createLinearGradient(0, eaveY, 0, eaveY + height * STRAND_LENGTH_RATIO);
    gradient.addColorStop(0, mixHexColors(palette.bronze, palette.iron, mood.silence));
    gradient.addColorStop(1, mixHexColors(palette.bronzeDeep, palette.iron, mood.silence));

    strandGradient = gradient;
    gradientSilenceKey = silenceKey;
    return gradient;
  }

  function draw(context: CanvasRenderingContext2D): void {
    context.clearRect(0, 0, width, height);

    const gradient = resolveStrandGradient(context);
    context.globalAlpha = STRAND_ALPHA;
    context.strokeStyle = gradient;
    context.fillStyle = gradient;
    context.lineCap = "round";
    context.lineJoin = "round";

    for (const strand of strands) {
      drawStrandBand(context, strand, 0, Math.ceil(strand.points.length / 2), STRAND_WIDTH_TOP_PX);
      drawStrandBand(
        context,
        strand,
        Math.ceil(strand.points.length / 2) - 1,
        strand.points.length,
        STRAND_WIDTH_BOTTOM_PX,
      );
    }

    for (const strand of strands) {
      for (const beadPosition of BEAD_POSITIONS) {
        const bead = interpolateAlongStrand(strand, beadPosition + strand.beadOffset);
        if (bead === null) {
          continue;
        }
        context.beginPath();
        context.arc(bead.x, bead.y, BEAD_RADIUS_PX, 0, Math.PI * 2);
        context.fill();
      }
    }

    context.globalAlpha = 1;
  }

  function drawStrandBand(
    context: CanvasRenderingContext2D,
    strand: Strand,
    fromIndex: number,
    toIndex: number,
    lineWidth: number,
  ): void {
    const first = strand.points[fromIndex];
    if (first === undefined) {
      return;
    }

    context.lineWidth = lineWidth;
    context.beginPath();
    context.moveTo(first.x, first.y);

    for (let pointIndex = fromIndex + 1; pointIndex < toIndex - 1; pointIndex += 1) {
      const current = strand.points[pointIndex];
      const next = strand.points[pointIndex + 1];
      if (current === undefined || next === undefined) {
        continue;
      }
      // Curve through the midpoints so the chain reads as a hanging cord, not a polyline.
      context.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
    }

    const last = strand.points[toIndex - 1];
    if (last !== undefined) {
      context.lineTo(last.x, last.y);
    }
    context.stroke();
  }

  function interpolateAlongStrand(
    strand: Strand,
    position: number,
  ): { x: number; y: number } | null {
    const clampedPosition = Math.min(0.98, Math.max(0.05, position));
    const scaled = clampedPosition * (strand.points.length - 1);
    const lowerIndex = Math.floor(scaled);
    const upperIndex = Math.min(lowerIndex + 1, strand.points.length - 1);
    const lower = strand.points[lowerIndex];
    const upper = strand.points[upperIndex];
    if (lower === undefined || upper === undefined) {
      return null;
    }
    const blend = scaled - lowerIndex;
    return {
      x: lower.x + (upper.x - lower.x) * blend,
      y: lower.y + (upper.y - lower.y) * blend,
    };
  }

  /**
   * Settles the curtain without animating, for the reduced-motion path and the first
   * paint. The result is the same composition the animated scene rests at.
   */
  function settle(steps = 150): void {
    isSettling = true;
    for (let stepIndex = 0; stepIndex < steps; stepIndex += 1) {
      step(FIXED_TIMESTEP_SECONDS);
    }
    isSettling = false;
  }

  return {
    resize,
    advance,
    draw,
    setMood,
    setPointer,
    clearPointer,
    sendGust,
    setCharge,
    rippleAt,
    setStrandStruckListener,
    settle,
  };
}

/** Blends two `#rrggbb` strings. `amount` 0 returns the first colour, 1 the second. */
export function mixHexColors(fromHex: string, toHex: string, amount: number): string {
  const clamped = Math.min(1, Math.max(0, amount));
  const from = parseHexColor(fromHex);
  const to = parseHexColor(toHex);
  const red = Math.round(from.red + (to.red - from.red) * clamped);
  const green = Math.round(from.green + (to.green - from.green) * clamped);
  const blue = Math.round(from.blue + (to.blue - from.blue) * clamped);
  return `rgb(${red}, ${green}, ${blue})`;
}

function parseHexColor(hex: string): { red: number; green: number; blue: number } {
  const normalized = hex.trim().replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((character) => character + character)
          .join("")
      : normalized;
  const value = Number.parseInt(expanded, 16);
  return {
    red: (value >> 16) & 255,
    green: (value >> 8) & 255,
    blue: value & 255,
  };
}
