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
export type WriteStep =
  | "seal"
  | "create-safe"
  | "fund-safe"
  | "enable-module"
  | "authorize-writer"
  | "release"
  | "execute"
  | "retry";

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
  /**
   * The transaction was mined but the chain still does not report the consent. Distinct from
   * a rejection on purpose: the money and the mandate may well be there, and the reader needs
   * to be told to look at the transaction rather than to press the button again.
   */
  | { reason: "consent-not-visible"; step: WriteStep }
  /** A Safe's state could not be read at all, as opposed to reading as "nothing granted". */
  | { reason: "safe-unreadable"; detail: string }
  /** A freshly created vault did not come out as a 1-of-1 owned by the wallet that asked. */
  | { reason: "wrong-safe-owner"; safeAddress: Address }
  /** The estate the owner typed is not a number of ETH this wallet could send. */
  | { reason: "invalid-amount" }
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

/** What a granted consent returns: the receipt, and the state the chain confirmed after it. */
export type GrantedConsent = { transactionHash: Hex; consents: SafeConsents };

/**
 * Polls until the chain reports a consent, rather than reading once and believing the answer.
 *
 * This is the fix for the worst bug this flow had. `waitForTransactionReceipt` returns as soon
 * as the transaction is mined, but the follow-up `eth_call` goes out to a load-balanced RPC
 * whose nodes do not all have that block yet. One read, landing on a node an instant behind,
 * reported the pre-transaction state; the step snapped back to "press me", and an owner who had
 * just approved a transaction in their wallet saw nothing happen at all.
 *
 * So the read is retried with backoff until the chain agrees or the budget runs out, and
 * running out is its own failure: the mandate is probably granted and the reader is pointed at
 * the transaction, never told to press the button again.
 */
async function awaitConsent({
  publicClient,
  safeAddress,
  moduleAddress,
  step,
  hasBeenGranted,
}: {
  publicClient: PublicClient;
  safeAddress: Address;
  moduleAddress: Address;
  step: WriteStep;
  hasBeenGranted: (consents: SafeConsents) => boolean;
}): Promise<WriteResult<SafeConsents>> {
  const attempt = await retryAsync(
    async () => {
      const read = await readSafeConsents({ publicClient, safeAddress, moduleAddress });
      if (!read.ok) {
        throw new Error(read.detail);
      }
      if (!hasBeenGranted(read.consents)) {
        throw new Error("[awaitConsent] the chain does not report it yet");
      }
      return read.consents;
    },
    // Roughly ten seconds of patience: several Sepolia blocks, and enough for a lagging node
    // in an RPC pool to catch up, without leaving a control spinning if something is wrong.
    { attempts: 6, initialDelayMs: 700, maxDelayMs: 3_000, backoffFactor: 1.6 },
  );

  return attempt.ok
    ? { ok: true, value: attempt.value }
    : { ok: false, failure: { reason: "consent-not-visible", step } };
}

/**
 * Enables TestamentModule on the owner's Safe.
 *
 * A 1-of-1 Safe whose owner sends the transaction needs no off-chain signing: Safe accepts
 * a pre-validated signature when `msg.sender` is the approving owner, so this is one
 * transaction rather than a Safe SDK round trip.
 *
 * Returns the state the chain confirmed afterwards, so the caller sets what it was told rather
 * than firing its own read into the same race this just waited out.
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
}): Promise<WriteResult<GrantedConsent>> {
  const account = walletClient.account;
  if (account === undefined) {
    return { ok: false, failure: { reason: "not-connected" } };
  }

  let transactionHash: Hex;
  try {
    const transaction = buildEnableModuleTransaction(safeAddress, moduleAddress, account.address);
    transactionHash = await walletClient.writeContract({
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
  } catch (error) {
    return { ok: false, failure: { reason: "transaction-failed", detail: describeError(error) } };
  }

  const confirmed = await awaitConsent({
    publicClient,
    safeAddress,
    moduleAddress,
    step: "enable-module",
    hasBeenGranted: (consents) => consents.moduleEnabled,
  });
  return confirmed.ok
    ? { ok: true, value: { transactionHash, consents: confirmed.value } }
    : confirmed;
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
}): Promise<WriteResult<GrantedConsent>> {
  const account = walletClient.account;
  if (account === undefined) {
    return { ok: false, failure: { reason: "not-connected" } };
  }

  const writerAddress = account.address;
  let transactionHash: Hex;
  try {
    const transaction = buildAuthorizeWriterTransaction(
      safeAddress,
      moduleAddress,
      writerAddress,
      writerAddress,
    );
    transactionHash = await walletClient.writeContract({
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
  } catch (error) {
    return { ok: false, failure: { reason: "transaction-failed", detail: describeError(error) } };
  }

  const confirmed = await awaitConsent({
    publicClient,
    safeAddress,
    moduleAddress,
    step: "authorize-writer",
    hasBeenGranted: (consents) =>
      consents.writer !== null && consents.writer.toLowerCase() === writerAddress.toLowerCase(),
  });
  return confirmed.ok
    ? { ok: true, value: { transactionHash, consents: confirmed.value } }
    : confirmed;
}

/**
 * What the chain said about a Safe's consents, or that it could not be asked.
 *
 * The distinction is the whole point. These reads used to collapse every failure into "no",
 * so a rate-limited or lagging RPC was indistinguishable from a Safe that had genuinely not
 * granted anything. That is how a consent could be approved in the wallet, land on-chain, and
 * still leave the interface showing the button that had just been pressed.
 */
export type SafeConsents = {
  moduleEnabled: boolean;
  /** The address the Safe named as its writer, or null if it has named nobody. */
  writer: Address | null;
};

export type SafeConsentsResult =
  | { ok: true; consents: SafeConsents }
  | { ok: false; detail: string };

/**
 * Both of a Safe's consents, in one pass.
 *
 * `isModuleEnabled` lives on the Safe and `authorizationOf` lives on the module, so a Safe
 * that has not enabled the module answers the first and reverts nothing on the second: an
 * address that is not a Safe at all is what makes the first call throw. That case is reported
 * as a failed read rather than a granted-nothing answer, because the interface has to be able
 * to say "that is not a Safe" without also claiming to know what it consented to.
 */
export async function readSafeConsents({
  publicClient,
  safeAddress,
  moduleAddress,
}: {
  publicClient: PublicClient;
  safeAddress: Address;
  moduleAddress: Address;
}): Promise<SafeConsentsResult> {
  try {
    const [moduleEnabled, authorization] = await Promise.all([
      publicClient.readContract({
        address: safeAddress,
        abi: safeManagementAbi,
        functionName: "isModuleEnabled",
        args: [moduleAddress],
      }),
      publicClient.readContract({
        address: moduleAddress,
        abi: testamentModuleAbi,
        functionName: "authorizationOf",
        args: [safeAddress],
      }),
    ]);
    const [writer] = authorization;
    return {
      ok: true,
      consents: { moduleEnabled, writer: writer === zeroAddress ? null : writer },
    };
  } catch (error) {
    return { ok: false, detail: describeError(error) };
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
 * An heir from a released will, carrying the slot it came from.
 *
 * The slot is what ties a name to its settlement: payment is tracked per slot on-chain, and
 * a retry addresses a slot rather than an address, so dropping the index here would leave the
 * interface unable to say which heir is still owed.
 */
export type ReleasedBequest = Bequest & { slot: number };

/**
 * Pays one heir a settled will still owes. Anyone may call this, including the heir.
 *
 * The registry takes nothing but the id and the slot: who is owed and how much were settled
 * and written down when the will was executed, so this cannot redirect or resize a payment.
 */
export async function retryHeirPayment({
  walletClient,
  publicClient,
  registryAddress,
  testamentId,
  slot,
}: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  registryAddress: Address;
  testamentId: bigint;
  slot: number;
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
      functionName: "retryPayment",
      args: [testamentId, slot],
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== "success") {
      return { ok: false, failure: { reason: "rejected", step: "retry" } };
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
}): Promise<WriteResult<ReleasedBequest[]>> {
  try {
    const handleClient = await createReadOnlyHandleClient();
    const decrypted = await Promise.all(
      slotHandles.map(async (slotHandle, slot) => {
        const attempt = await retryAsync(() => handleClient.publicDecrypt(slotHandle));
        if (!attempt.ok) {
          throw attempt.lastError;
        }
        return { slot, ...unpackBequest(attempt.value.value as bigint) };
      }),
    );
    return { ok: true, value: decrypted.filter((bequest) => !isPaddedBequest(bequest)) };
  } catch (error) {
    return { ok: false, failure: { reason: "encryption-failed", slotIndex: null, detail: describeError(error) } };
  }
}
