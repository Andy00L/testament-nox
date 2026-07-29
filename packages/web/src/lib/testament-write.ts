import { createViemHandleClient } from "@iexec-nox/handle";
import {
  buildAuthorizeWriterTransaction,
  buildEnableModuleTransaction,
  collectDecryptionProofs,
  encryptTestamentSlots,
  isPaddedBequest,
  packBequests,
  retryAsync,
  safeManagementAbi,
  testamentModuleAbi,
  testamentRegistryAbi,
  unpackBequest,
  type Bequest,
  type PackBequestsFailure,
} from "@testament/shared";
import { zeroAddress, type Address, type Hex, type PublicClient, type WalletClient } from "viem";

import { createReadOnlyHandleClient } from "@/lib/nox-client";

/**
 * Every write the app makes. Each one reports its outcome as a value rather than throwing,
 * so the interface can render a real error state instead of an unhandled rejection.
 *
 * The encryption happens here, in the browser, before anything touches the chain: the
 * plaintext of a will never leaves the owner's machine unencrypted, and the padding that
 * hides the beneficiary count is produced in the same pass as the real slots.
 */

/** The on-chain gesture a failure belongs to, so the interface can name what went wrong. */
export type WriteStep = "seal" | "enable-module" | "authorize-writer" | "release" | "execute";

/**
 * Failures carry reasons and raw detail, never finished sentences.
 *
 * Copy belongs to the language layer: a message baked in here would arrive in one language
 * whatever the page is set to, which is exactly the bug this shape prevents. `detail` is the
 * untranslatable part, a wallet or gateway string quoted verbatim.
 */
export type WriteFailure =
  | { reason: "not-connected" }
  | { reason: "invalid-will"; packFailure: PackBequestsFailure }
  | { reason: "encryption-failed"; slotIndex: number | null; detail: string }
  | { reason: "rejected"; step: WriteStep }
  | { reason: "transaction-failed"; detail: string };

export type WriteResult<TValue> = { ok: true; value: TValue } | { ok: false; failure: WriteFailure };

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
      failure: { reason: "invalid-will", packFailure: packed.failure },
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
          slotIndex: encrypted.failure.slotIndex,
          detail: encrypted.failure.message,
        },
      };
    }
    encryptedHandles = encrypted.encryptions.handles;
    encryptedProofs = encrypted.encryptions.proofs;
  } catch (error) {
    return { ok: false, failure: { reason: "encryption-failed", slotIndex: null, detail: describeError(error) } };
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
        failure: { reason: "rejected", step: "seal" },
      };
    }
    return { ok: true, value: transactionHash };
  } catch (error) {
    return { ok: false, failure: { reason: "transaction-failed", detail: describeError(error) } };
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
        failure: { reason: "rejected", step: "enable-module" },
      };
    }
    return { ok: true, value: transactionHash };
  } catch (error) {
    return { ok: false, failure: { reason: "transaction-failed", detail: describeError(error) } };
  }
}

/**
 * Has the Safe name this wallet as the one address allowed to draw its will.
 *
 * Enabling the module is not consent to any particular testament: it grants the module
 * unrestricted spending authority over the Safe, so the module asks for a second, narrower
 * consent naming the writer. That naming can only come from the Safe itself, which is why
 * this goes through `execTransaction` instead of calling the module directly.
 *
 * A 1-of-1 Safe whose owner sends the transaction needs no off-chain signing, the same
 * pre-validated signature trick `enableModuleOnSafe` uses.
 */
export async function authorizeWriterOnSafe({
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
    const transaction = buildAuthorizeWriterTransaction(
      safeAddress,
      moduleAddress,
      account.address,
      account.address,
    );
    const transactionHash = await walletClient.writeContract({
      ...transaction,
      account,
      chain: walletClient.chain,
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== "success") {
      return {
        ok: false,
        failure: { reason: "rejected", step: "authorize-writer" },
      };
    }
    return { ok: true, value: transactionHash };
  } catch (error) {
    return { ok: false, failure: { reason: "transaction-failed", detail: describeError(error) } };
  }
}

/**
 * The address the Safe has named as its writer, or null if it has named nobody.
 *
 * Read as a value: an address that is not a Safe, or a module that has never heard of it,
 * both answer null rather than throwing, so a mistyped Safe surfaces in the interface as
 * "not named yet" instead of an unhandled rejection.
 */
export async function readSafeWriter({
  publicClient,
  safeAddress,
  moduleAddress,
}: {
  publicClient: PublicClient;
  safeAddress: Address;
  moduleAddress: Address;
}): Promise<Address | null> {
  try {
    const [writer] = await publicClient.readContract({
      address: moduleAddress,
      abi: testamentModuleAbi,
      functionName: "authorizationOf",
      args: [safeAddress],
    });
    return writer === zeroAddress ? null : writer;
  } catch {
    return null;
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
        failure: { reason: "rejected", step: "release" },
      };
    }
    return { ok: true, value: transactionHash };
  } catch (error) {
    return { ok: false, failure: { reason: "transaction-failed", detail: describeError(error) } };
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
          slotIndex: collected.failure.slotIndex,
          detail: collected.failure.message,
        },
      };
    }
    proofs = collected.proofs;
  } catch (error) {
    return { ok: false, failure: { reason: "encryption-failed", slotIndex: null, detail: describeError(error) } };
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
        failure: { reason: "rejected", step: "execute" },
      };
    }
    return { ok: true, value: transactionHash };
  } catch (error) {
    return { ok: false, failure: { reason: "transaction-failed", detail: describeError(error) } };
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
    return { ok: false, failure: { reason: "encryption-failed", slotIndex: null, detail: describeError(error) } };
  }
}
