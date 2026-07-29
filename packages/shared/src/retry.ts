export type RetryOptions = {
  /** Total attempts, including the first. */
  attempts?: number;
  /** Delay before the second attempt. Unit: milliseconds. */
  initialDelayMs?: number;
  /** Upper bound on the delay between attempts. Unit: milliseconds. */
  maxDelayMs?: number;
  /** Multiplier applied to the delay after each failed attempt. */
  backoffFactor?: number;
  /** Called before each wait, so callers can surface progress. */
  onRetry?: (attempt: number, error: unknown) => void;
};

export type RetryResult<TValue> =
  | { ok: true; value: TValue }
  | { ok: false; attempts: number; lastError: unknown };

/**
 * Retries an operation with exponential backoff and reports the outcome as a value.
 *
 * Used for Handle Gateway reads: a handle is only decryptable once the runner has produced
 * and stored its ciphertext, which lands a little after the transaction that created it.
 */
export async function retryAsync<TValue>(
  operation: () => Promise<TValue>,
  {
    attempts = 8,
    initialDelayMs = 1_000,
    maxDelayMs = 8_000,
    backoffFactor = 1.6,
    onRetry,
  }: RetryOptions = {},
): Promise<RetryResult<TValue>> {
  let delayMs = initialDelayMs;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      lastError = error;
      if (attempt === attempts) {
        break;
      }
      onRetry?.(attempt, error);
      await sleep(delayMs);
      delayMs = Math.min(delayMs * backoffFactor, maxDelayMs);
    }
  }

  return { ok: false, attempts, lastError };
}

export function sleep(durationMs: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, durationMs));
}
