import {
  buildAuthorizeWriterTransaction,
  testamentModuleAbi,
  testamentRegistryAbi,
} from "@testament/shared";
import type {
  Account,
  Address,
  Chain,
  Hex,
  PublicClient,
  Transport,
  WalletClient,
} from "viem";

/**
 * Making sure a Safe's mandate can still pay for a will, before a script tries to write one.
 *
 * Enabling the module is not consent to any particular testament: the Safe also names the
 * writer, and one naming buys exactly one will. Every script that calls `write` therefore has
 * to answer the same two questions first (is this wallet the named writer, and has that
 * naming already been spent), so the answer lives here rather than in each script.
 * sourceRef: contracts/TestamentRegistry.sol, the `WriterNotAuthorized` and
 * `AuthorizationAlreadyUsed` requires in `write`.
 */

/**
 * The clients this helper drives. viem's own types are used rather than minimal structural
 * ones, because `readContract` resolves its return type from the abi it is handed: a narrowed
 * stand-in erases that inference and the results come back as `unknown`.
 */
type MandateReader = PublicClient<Transport, Chain>;
type MandateGranter = WalletClient<Transport, Chain, Account>;

export type MandateFailure =
  | { reason: "writer-not-mandated"; mandatedWriter: Address; writer: Address }
  | { reason: "authorization-reverted"; transactionHash: Hex };

export type EnsureSpendableMandateResult =
  | {
      ok: true;
      /** The nonce the next `write` will consume. */
      nonce: number;
      /** The Safe transaction that granted a fresh mandate, or null when none was needed. */
      transactionHash: Hex | null;
    }
  | { ok: false; failure: MandateFailure };

export function describeMandateFailure(failure: MandateFailure): string {
  if (failure.reason === "writer-not-mandated") {
    return `the Safe's writer is ${failure.mandatedWriter}, not ${failure.writer}. Run: bun run authorize-writer:sepolia`;
  }
  return `the Safe's authorization transaction reverted: ${failure.transactionHash}`;
}

export type EnsureSpendableMandateParameters = {
  reader: MandateReader;
  granter: MandateGranter;
  safeAddress: Address;
  moduleAddress: Address;
  registryAddress: Address;
  /** The wallet that will call `write`, and the Safe owner submitting the grant. */
  writerAddress: Address;
  /**
   * Grant a fresh mandate even when the current one is unspent. The retry demo sets this so
   * the recording always contains the authorization transaction.
   */
  alwaysGrant?: boolean;
  /** Progress reporting, so each script keeps its own log prefix. */
  onGrant?: (currentNonce: number) => void;
};

export async function ensureSpendableMandate(
  parameters: EnsureSpendableMandateParameters,
): Promise<EnsureSpendableMandateResult> {
  const {
    reader,
    granter,
    safeAddress,
    moduleAddress,
    registryAddress,
    writerAddress,
    alwaysGrant = false,
    onGrant,
  } = parameters;

  const [mandatedWriter, mandateNonce] = await reader.readContract({
    address: moduleAddress,
    abi: testamentModuleAbi,
    functionName: "authorizationOf",
    args: [safeAddress],
  });

  // Naming the writer the first time is the consent, and it stays a deliberate step the human
  // takes: a script that granted its own mandate would be demonstrating the opposite of what
  // the separation is for. Renewing a mandate this same wallet already holds is not that, so
  // only the first naming is refused here.
  if (!alwaysGrant && mandatedWriter.toLowerCase() !== writerAddress.toLowerCase()) {
    return {
      ok: false,
      failure: { reason: "writer-not-mandated", mandatedWriter, writer: writerAddress },
    };
  }

  // The registry, not the module, remembers what has been spent: spending the mandate inside
  // `write` must not invalidate the will that same call is creating.
  const consumedNonce = await reader.readContract({
    address: registryAddress,
    abi: testamentRegistryAbi,
    functionName: "consumedAuthNonce",
    args: [safeAddress],
  });

  if (!alwaysGrant && mandateNonce > consumedNonce) {
    return { ok: true, nonce: mandateNonce, transactionHash: null };
  }

  onGrant?.(mandateNonce);
  const transactionHash = await granter.writeContract(
    buildAuthorizeWriterTransaction(safeAddress, moduleAddress, writerAddress, writerAddress),
  );
  const receipt = await reader.waitForTransactionReceipt({ hash: transactionHash });
  if (receipt.status !== "success") {
    return { ok: false, failure: { reason: "authorization-reverted", transactionHash } };
  }

  const [, grantedNonce] = await reader.readContract({
    address: moduleAddress,
    abi: testamentModuleAbi,
    functionName: "authorizationOf",
    args: [safeAddress],
  });

  return { ok: true, nonce: grantedNonce, transactionHash };
}
