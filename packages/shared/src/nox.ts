import type { Hex } from "viem";

import { SLOT_COUNT } from "./slots.ts";

/**
 * Encrypts one slot value and returns the pair a contract call needs.
 * Callers bind their own Nox client, which keeps this package free of a dependency on a
 * specific SDK version and lets the Hardhat plugin helper and the browser SDK client
 * both drive the same code.
 *
 * Bind it like this:
 *   (slotValue) => handleClient.encryptInput(slotValue, "uint256", registryAddress)
 */
export type EncryptSlotValue = (
  slotValue: bigint,
) => Promise<{ handle: Hex; handleProof: Hex }>;

/**
 * Fetches the decryption proof for one released slot.
 * Bind it like this:
 *   async (handle) => (await handleClient.publicDecrypt(handle)).decryptionProof
 */
export type FetchSlotDecryptionProof = (slotHandle: Hex) => Promise<Hex>;

export type SlotEncryptions = {
  /** Index-aligned with `proofs`, always SLOT_COUNT long. */
  handles: Hex[];
  proofs: Hex[];
};

export type NoxGatewayFailure = {
  reason: "gateway-call-failed";
  slotIndex: number;
  message: string;
};

export type EncryptSlotsResult =
  | { ok: true; encryptions: SlotEncryptions }
  | { ok: false; failure: NoxGatewayFailure };

export type DecryptionProofsResult =
  | { ok: true; proofs: Hex[] }
  | { ok: false; failure: NoxGatewayFailure };

/**
 * Encrypts every slot of a will in one pass.
 *
 * All SLOT_COUNT values go through the gateway, padding included, so the request pattern
 * carries no hint about how many beneficiaries a testament really has. Calls run
 * concurrently but settle independently, so one gateway hiccup names the slot that failed
 * instead of discarding the seven that worked.
 * sourceRef: docs.noxprotocol.io /references/js-sdk/methods/encryptInput, "Encrypting
 * multiple values concurrently".
 */
export async function encryptTestamentSlots(
  slotValues: readonly bigint[],
  encryptSlotValue: EncryptSlotValue,
): Promise<EncryptSlotsResult> {
  if (slotValues.length !== SLOT_COUNT) {
    return {
      ok: false,
      failure: {
        reason: "gateway-call-failed",
        slotIndex: -1,
        message: `Expected ${SLOT_COUNT} slot values, got ${slotValues.length}.`,
      },
    };
  }

  const settled = await Promise.allSettled(
    slotValues.map((slotValue) => encryptSlotValue(slotValue)),
  );

  const handles: Hex[] = [];
  const proofs: Hex[] = [];

  for (const [slotIndex, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      return {
        ok: false,
        failure: {
          reason: "gateway-call-failed",
          slotIndex,
          message: describeUnknownError(outcome.reason),
        },
      };
    }
    handles.push(outcome.value.handle);
    proofs.push(outcome.value.handleProof);
  }

  return { ok: true, encryptions: { handles, proofs } };
}

/**
 * Collects one gateway decryption proof per slot of a released testament.
 * The proofs are what `TestamentRegistry.execute` verifies on-chain, so whoever gathers
 * them is a courier and not an authority: a forged proof is rejected by NoxCompute.
 */
export async function collectDecryptionProofs(
  slotHandles: readonly Hex[],
  fetchSlotDecryptionProof: FetchSlotDecryptionProof,
): Promise<DecryptionProofsResult> {
  if (slotHandles.length !== SLOT_COUNT) {
    return {
      ok: false,
      failure: {
        reason: "gateway-call-failed",
        slotIndex: -1,
        message: `Expected ${SLOT_COUNT} slot handles, got ${slotHandles.length}.`,
      },
    };
  }

  const settled = await Promise.allSettled(
    slotHandles.map((slotHandle) => fetchSlotDecryptionProof(slotHandle)),
  );

  const proofs: Hex[] = [];
  for (const [slotIndex, outcome] of settled.entries()) {
    if (outcome.status === "rejected") {
      return {
        ok: false,
        failure: {
          reason: "gateway-call-failed",
          slotIndex,
          message: describeUnknownError(outcome.reason),
        },
      };
    }
    proofs.push(outcome.value);
  }

  return { ok: true, proofs };
}

function describeUnknownError(thrown: unknown): string {
  if (thrown instanceof Error) {
    return thrown.message;
  }
  return String(thrown);
}
