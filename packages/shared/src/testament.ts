import type { Address } from "viem";

/**
 * Lifecycle of a testament, mirroring the on-chain enum ordinals.
 * sourceRef: packages/contracts/contracts/TestamentRegistry.sol, `TestamentState`.
 */
export const TESTAMENT_STATE = {
  None: 0,
  Active: 1,
  Released: 2,
  /** Settled once, but at least one heir refused their share. The debt is retryable. */
  PartiallyExecuted: 3,
  Executed: 4,
  Revoked: 5,
} as const;

export type TestamentState = (typeof TESTAMENT_STATE)[keyof typeof TESTAMENT_STATE];

export const TESTAMENT_STATE_NAME: Record<TestamentState, string> = {
  [TESTAMENT_STATE.None]: "none",
  [TESTAMENT_STATE.Active]: "active",
  [TESTAMENT_STATE.Released]: "released",
  [TESTAMENT_STATE.PartiallyExecuted]: "partially-executed",
  [TESTAMENT_STATE.Executed]: "executed",
  [TESTAMENT_STATE.Revoked]: "revoked",
};

/** The public half of a testament, as returned by `TestamentRegistry.testamentOf`. */
export type TestamentSummary = {
  owner: Address;
  safe: Address;
  /** Unit: seconds. */
  interval: number;
  /** Unit: seconds. */
  grace: number;
  /** Unit: seconds since epoch. */
  lastHeartbeat: number;
  state: TestamentState;
};

/**
 * Fraction of the interval after which the curtain starts to age.
 * sourceRef: TESTAMENT_BUILD_PLAN.md section 5.3, "Aging (past 60% of interval)".
 */
const AGING_THRESHOLD_RATIO = 0.6;

/**
 * How a live testament reads to the scene and to the copy.
 * `expired` means anyone may call `release`, not that anyone has.
 */
export type TestamentPhase = "healthy" | "aging" | "expired";

/** Timestamp after which `release` is allowed. Unit: seconds since epoch. */
export function computeDeadline(testament: TestamentSummary): number {
  return testament.lastHeartbeat + testament.interval + testament.grace;
}

/** Seconds left before the wind falls. Zero once the deadline has passed. */
export function computeSecondsUntilDeadline(
  testament: TestamentSummary,
  nowSeconds: number,
): number {
  return Math.max(0, computeDeadline(testament) - nowSeconds);
}

/**
 * Where a testament sits between its last heartbeat and its deadline.
 * The scene reads this directly: healthy is warm brass and a lively breeze, aging
 * desaturates toward cold iron, expired stills the curtain.
 */
export function computeTestamentPhase(
  testament: TestamentSummary,
  nowSeconds: number,
): TestamentPhase {
  const elapsedSeconds = nowSeconds - testament.lastHeartbeat;
  if (elapsedSeconds > testament.interval + testament.grace) {
    return "expired";
  }
  if (elapsedSeconds >= testament.interval * AGING_THRESHOLD_RATIO) {
    return "aging";
  }
  return "healthy";
}

/**
 * Progress from the last heartbeat to the deadline, clamped to [0, 1].
 * Drives the continuous part of the scene: breeze speed and strand colour.
 */
export function computeSilenceProgress(testament: TestamentSummary, nowSeconds: number): number {
  const totalSeconds = testament.interval + testament.grace;
  if (totalSeconds <= 0) {
    return 1;
  }
  const elapsedSeconds = nowSeconds - testament.lastHeartbeat;
  return Math.min(1, Math.max(0, elapsedSeconds / totalSeconds));
}
