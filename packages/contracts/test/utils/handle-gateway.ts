import { setTimeout as sleep } from "node:timers/promises";

import { handleGatewayUrl } from "@iexec-nox/nox-hardhat-plugin";
import type { Hex } from "viem";

/**
 * Polls the local Nox handle gateway until every handle is reported as resolved, meaning
 * the runner has produced its ciphertext and stored it. A handle read straight out of a
 * contract is not decryptable until this settles.
 *
 * Adapted from iExec-Nox/nox-hardhat-starter, test/utils/handle-gateway.ts (MIT), with the
 * gateway URL taken from the plugin's `handleGatewayUrl()` (the host port is assigned by
 * Docker at boot) and batched over several handles.
 */
export async function waitForHandlesResolved(
  handles: readonly Hex[],
  {
    timeoutMs = 120_000,
    initialPollMs = 500,
    maxPollMs = 5_000,
    backoffFactor = 1.5,
  }: {
    timeoutMs?: number;
    initialPollMs?: number;
    maxPollMs?: number;
    backoffFactor?: number;
  } = {},
): Promise<void> {
  const statusUrl = `${handleGatewayUrl()}/v0/public/handles/status`;
  const deadline = Date.now() + timeoutMs;
  const pending = new Set(handles.map((handle) => handle.toLowerCase()));
  let pollMs = initialPollMs;

  while (pending.size > 0 && Date.now() < deadline) {
    const response = await fetch(statusUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ handles: [...pending] }),
    });

    if (response.ok) {
      const body = (await response.json()) as {
        payload: { statuses: Array<{ handle: string; resolved: boolean }> };
      };
      for (const status of body.payload.statuses) {
        if (status.resolved) {
          pending.delete(status.handle.toLowerCase());
        }
      }
    }

    if (pending.size === 0) {
      return;
    }

    await sleep(pollMs);
    pollMs = Math.min(pollMs * backoffFactor, maxPollMs);
  }

  if (pending.size > 0) {
    throw new Error(
      `[waitForHandlesResolved] ${pending.size} handle(s) unresolved after ${timeoutMs}ms`,
    );
  }
}
