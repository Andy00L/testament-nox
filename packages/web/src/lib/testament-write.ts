import { createViemHandleClient } from "@iexec-nox/handle";
import {
  buildEnableModuleTransaction,
  collectDecryptionProofs,
  describePackFailure,
  encryptTestamentSlots,
  isPaddedBequest,
  packBequests,
  retryAsync,
  safeManagementAbi,
  testamentRegistryAbi,
  unpackBequest,
  type Bequest,
} from "@testament/shared";
import type { Address, Hex, PublicClient, WalletClient } from "viem";

import { createReadOnlyHandleClient } from "@/lib/nox-client";

/**
 * Every write the app makes. Each one reports its outcome as a value rather than throwing,
 * so the interface can render a real error state instead of an unhandled rejection.
 *
 * The encryption happens here, in the browser, before anything touches the chain: the
 * plaintext of a will never leaves the owner's machine unencrypted, and the padding that
 * hides the beneficiary count is produced in the same pass as the real slots.
 */

export type WriteFailure =
  | { reason: "not-connected" }
  | { reason: "invalid-will"; message: string }
  | { reason: "encryption-failed"; message: string }
  | { reason: "transaction-failed"; message: string };

export type WriteResult<TValue> = { ok: true; value: TValue } | { ok: false; failure: WriteFailure };

export function describeWriteFailure(failure: WriteFailure): string {
  switch (failure.reason) {
    case "not-connected":
      return "Connectez un portefeuille pour continuer.";
    case "invalid-will":
      return failure.message;
    case "encryption-failed":
      return `Le chiffrement a échoué : ${failure.message}`;
    case "transaction-failed":
      return failure.message;
  }
}

/**
 * Encrypts a will slot by slot and seals it on-chain.
 *
 * The wallet that encrypts has to be the direct caller of the registry: Nox binds each
 * input proof to the pair (encrypting wallet, target contract).
 * sourceRef: docs.noxprotocol.io /references/solidity-library/methods/core-primitives/fromExternal
 */
export async function sealTestament({
  walletClient,
  publicClient,
  registryAddress,
  safeAddress,
  bequests,
  intervalSeconds,
  graceSeconds,
  onProgress,
}: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  registryAddress: Address;
  safeAddress: Address;
  bequests: readonly Bequest[];
  intervalSeconds: number;
  graceSeconds: number;
  onProgress?: (stage: "encrypting" | "signing" | "confirming") => void;
}): Promise<WriteResult<Hex>> {
  const account = walletClient.account;
  if (account === undefined) {
    return { ok: false, failure: { reason: "not-connected" } };
  }

  const packed = packBequests(bequests);
  if (!packed.ok) {
    return {
      ok: false,
      failure: { reason: "invalid-will", message: describePackFailure(packed.failure) },
    };
  }

  onProgress?.("encrypting");

  let encryptedHandles: Hex[];
  let encryptedProofs: Hex[];
  try {
    const handleClient = await createViemHandleClient(walletClient);
    const encrypted = await encryptTestamentSlots(packed.slots, (slotValue) =>
      handleClient.encryptInput(slotValue, "uint256", registryAddress),
    );
    if (!encrypted.ok) {
      return {
        ok: false,
        failure: {
          reason: "encryption-failed",
          message: `emplacement ${encrypted.failure.slotIndex + 1} : ${encrypted.failure.message}`,
        },
      };
    }
    encryptedHandles = encrypted.encryptions.handles;
    encryptedProofs = encrypted.encryptions.proofs;
  } catch (error) {
    return { ok: false, failure: { reason: "encryption-failed", message: describeError(error) } };
  }

  onProgress?.("signing");

  try {
    const transactionHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: registryAddress,
      abi: testamentRegistryAbi,
      functionName: "write",
      args: [safeAddress, intervalSeconds, graceSeconds, encryptedHandles, encryptedProofs],
    });

    onProgress?.("confirming");
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== "success") {
      return {
        ok: false,
        failure: { reason: "transaction-failed", message: "La transaction a été rejetée." },
      };
    }
    return { ok: true, value: transactionHash };
  } catch (error) {
    return { ok: false, failure: { reason: "transaction-failed", message: describeError(error) } };
  }
}

/**
 * Enables TestamentModule on the owner's Safe.
 *
 * A 1-of-1 Safe whose owner sends the transaction needs no off-chain signing: Safe accepts
 * a pre-validated signature when `msg.sender` is the approving owner, so this is one
 * transaction rather than a Safe SDK round trip.
 */
export async function enableModuleOnSafe({
  walletClient,
  publicClient,
  safeAddress,
  moduleAddress,
}: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  safeAddress: Address;
  moduleAddress: Address;
}): Promise<WriteResult<Hex>> {
  const account = walletClient.account;
  if (account === undefined) {
    return { ok: false, failure: { reason: "not-connected" } };
  }

  try {
    const transaction = buildEnableModuleTransaction(safeAddress, moduleAddress, account.address);
    const transactionHash = await walletClient.writeContract({
      ...transaction,
      account,
      chain: walletClient.chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== "success") {
      return {
        ok: false,
        failure: {
          reason: "transaction-failed",
          message:
            "Le Safe a rejeté l'activation. Vérifiez que le portefeuille connecté est bien propriétaire du Safe et que le seuil est de 1.",
        },
      };
    }
    return { ok: true, value: transactionHash };
  } catch (error) {
    return { ok: false, failure: { reason: "transaction-failed", message: describeError(error) } };
  }
}

/** Whether a Safe has already enabled the module. Read as a value: a bad address is false. */
export async function readModuleEnabled({
  publicClient,
  safeAddress,
  moduleAddress,
}: {
  publicClient: PublicClient;
  safeAddress: Address;
  moduleAddress: Address;
}): Promise<boolean> {
  try {
    return await publicClient.readContract({
      address: safeAddress,
      abi: safeManagementAbi,
      functionName: "isModuleEnabled",
      args: [moduleAddress],
    });
  } catch {
    return false;
  }
}

function describeError(thrown: unknown): string {
  if (thrown instanceof Error) {
    // viem stacks the useful sentence first and the ABI dump after; keep the sentence.
    return thrown.message.split("\n")[0] ?? thrown.message;
  }
  return String(thrown);
}

/**
 * Opens a testament whose silence has outlasted interval plus grace.
 *
 * Permissionless by design: a beneficiary, a keeper, or a judge reading this repository can
 * all call it, and none of them gains anything the others do not have.
 */
export async function releaseTestament({
  walletClient,
  publicClient,
  registryAddress,
  testamentId,
}: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  registryAddress: Address;
  testamentId: bigint;
}): Promise<WriteResult<Hex>> {
  const account = walletClient.account;
  if (account === undefined) {
    return { ok: false, failure: { reason: "not-connected" } };
  }

  try {
    const transactionHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: registryAddress,
      abi: testamentRegistryAbi,
      functionName: "release",
      args: [testamentId],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== "success") {
      return {
        ok: false,
        failure: { reason: "transaction-failed", message: "L'ouverture a été rejetée." },
      };
    }
    return { ok: true, value: transactionHash };
  } catch (error) {
    return { ok: false, failure: { reason: "transaction-failed", message: describeError(error) } };
  }
}

/**
 * Pays the heirs.
 *
 * The caller fetches one gateway decryption proof per slot and hands them to the registry,
 * which verifies every signature on-chain before moving a wei. Whoever sends this
 * transaction is a courier: a forged proof is rejected by NoxCompute, so no trust is placed
 * in them at any point.
 */
export async function executeTestament({
  walletClient,
  publicClient,
  registryAddress,
  testamentId,
  slotHandles,
}: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  registryAddress: Address;
  testamentId: bigint;
  slotHandles: readonly Hex[];
}): Promise<WriteResult<Hex>> {
  const account = walletClient.account;
  if (account === undefined) {
    return { ok: false, failure: { reason: "not-connected" } };
  }

  let proofs: Hex[];
  try {
    const handleClient = await createViemHandleClient(walletClient);
    const collected = await collectDecryptionProofs([...slotHandles], async (slotHandle) => {
      const attempt = await retryAsync(() => handleClient.publicDecrypt(slotHandle));
      if (!attempt.ok) {
        throw attempt.lastError;
      }
      return attempt.value.decryptionProof;
    });
    if (!collected.ok) {
      return {
        ok: false,
        failure: {
          reason: "encryption-failed",
          message: `emplacement ${collected.failure.slotIndex + 1} : ${collected.failure.message}`,
        },
      };
    }
    proofs = collected.proofs;
  } catch (error) {
    return { ok: false, failure: { reason: "encryption-failed", message: describeError(error) } };
  }

  try {
    const transactionHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: registryAddress,
      abi: testamentRegistryAbi,
      functionName: "execute",
      args: [testamentId, proofs],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== "success") {
      return {
        ok: false,
        failure: { reason: "transaction-failed", message: "Le paiement a été rejeté." },
      };
    }
    return { ok: true, value: transactionHash };
  } catch (error) {
    return { ok: false, failure: { reason: "transaction-failed", message: describeError(error) } };
  }
}

/**
 * Reads a released will in clear. Only ever succeeds once the slots are publicly decryptable.
 *
 * Takes no wallet: an opened testament is public by construction, so a visitor should be
 * able to read it before deciding whether to connect anything.
 */
export async function readReleasedWill({
  slotHandles,
}: {
  slotHandles: readonly Hex[];
}): Promise<WriteResult<Bequest[]>> {
  try {
    const handleClient = await createReadOnlyHandleClient();
    const decrypted = await Promise.all(
      slotHandles.map(async (slotHandle) => {
        const attempt = await retryAsync(() => handleClient.publicDecrypt(slotHandle));
        if (!attempt.ok) {
          throw attempt.lastError;
        }
        return unpackBequest(attempt.value.value as bigint);
      }),
    );
    return { ok: true, value: decrypted.filter((bequest) => !isPaddedBequest(bequest)) };
  } catch (error) {
    return { ok: false, failure: { reason: "encryption-failed", message: describeError(error) } };
  }
}
