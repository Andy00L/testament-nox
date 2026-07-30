"use client";

import {
  SAFE_PROXY_CREATION_EVENT,
  SAFE_PROXY_FACTORY,
  SAFE_SINGLETON,
  encodeSafeSetup,
  predictSafeProxyAddress,
  safeManagementAbi,
  safeProxyFactoryAbi,
} from "@testament/shared";
import { parseEther, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { useBalance, useBytecode, useReadContract } from "wagmi";

import { classifyTransactionThrow, type WriteResult } from "@/lib/testament-write";

/**
 * The vault, derived rather than asked for.
 *
 * Typing a Safe address by hand was the last piece of homework this product still set. It
 * cannot be removed by looking the address up, because there is no on-chain way to ask which
 * Safes a wallet owns, and Safe's own transaction service is the same off-chain dependency
 * that failed during testing and blocked the flow entirely.
 *
 * So the address is computed. `createProxyWithNonce` deploys with CREATE2, which makes the
 * result a pure function of the factory, the singleton, the initializer and the salt. The
 * initializer holds the owner, so every wallet has exactly one Testament vault address, and
 * that address is knowable before the vault exists. Reading the code at it answers whether it
 * does: code means show it, no code means offer to create it.
 *
 * The creation code itself is read from the factory rather than embedded here, so this cannot
 * predict an address the chain would not actually produce.
 */

/**
 * The salt that separates a Testament vault from any other Safe the same owner might create.
 *
 * Fixed on purpose: one wallet, one derived vault, at an address that is the same on every
 * visit and every device with no storage anywhere. An owner who wants a different Safe types
 * its address instead, which is why the field stays editable.
 */
const TESTAMENT_SALT_NONCE = 0n;

/** What the deployed vault is expected to be, checked from the chain before ETH moves. */
const EXPECTED_THRESHOLD = 1n;

/** What the funding control offers by default, matching the demo estate. Unit: ETH. */
export const DEFAULT_ESTATE_ETH = "0.02";

export type TestamentVault =
  /** No wallet connected, so there is no owner to derive an address from. */
  | { status: "no-owner" }
  /** The chain has not answered yet, or the factory is not on this network. */
  | { status: "reading" }
  /**
   * The code read failed outright. Its own state because it is its own fact: "absent" invites
   * creating, and creating a vault that exists reverts at the factory, so an unanswered
   * question must never wear either answer.
   */
  | { status: "unreadable"; address: Address }
  /** Derived, and nothing is deployed there yet. */
  | { status: "absent"; address: Address }
  /** Deployed. The estate is what it currently holds, and may be zero. */
  | { status: "present"; address: Address; estateWei: bigint };

/**
 * The connected wallet's Testament vault: where it is, and whether it exists yet.
 *
 * Three chain reads, all through wagmi's cache rather than an effect: the factory's creation
 * code (pure, so it is fetched once and never refetched), the code at the derived address,
 * and its balance. Nothing here writes; the caller decides what to offer.
 *
 * `refreshVault` is handed back because creating or funding the vault changes two of those
 * reads and neither can notice on its own. The caller that sent the transaction is the only
 * thing that knows the answer is now stale.
 */
export function useTestamentVault(ownerAddress: Address | undefined): {
  vault: TestamentVault;
  refreshVault: () => void;
} {
  const creationCodeQuery = useReadContract({
    address: SAFE_PROXY_FACTORY,
    abi: safeProxyFactoryAbi,
    functionName: "proxyCreationCode",
    // A pure function of a deployed contract: the answer cannot change while the app runs.
    query: { staleTime: Number.POSITIVE_INFINITY, gcTime: Number.POSITIVE_INFINITY },
  });

  const proxyCreationCode = creationCodeQuery.data;
  const derivedAddress =
    ownerAddress === undefined || proxyCreationCode === undefined
      ? undefined
      : predictSafeProxyAddress({
          proxyCreationCode,
          initializer: encodeSafeSetup(ownerAddress),
          saltNonce: TESTAMENT_SALT_NONCE,
        });

  const bytecodeQuery = useBytecode({
    address: derivedAddress,
    query: { enabled: derivedAddress !== undefined },
  });
  const balanceQuery = useBalance({
    address: derivedAddress,
    query: { enabled: derivedAddress !== undefined },
  });

  const refreshVault = () => {
    void bytecodeQuery.refetch();
    void balanceQuery.refetch();
  };

  return {
    vault: readVaultState({
      ownerAddress,
      derivedAddress,
      isReadingCode: bytecodeQuery.isPending,
      hasCodeReadFailed: bytecodeQuery.isError,
      // wagmi's query layer stores viem's "no code there" (`undefined`) as `null`, because
      // TanStack Query refuses undefined data. The runtime value is null while the declared
      // type is not, and comparing against undefined alone is how an empty address once
      // read as a deployed vault: it was offered funding, took 0.02 ETH, and had no code to
      // ever pay it back out. `?? null` makes the runtime honest and the pending case is
      // carried by `isReadingCode`, never by the data being absent.
      // sourceRef: @wagmi/core dist/esm/query/getBytecode.js, `return (bytecode ?? null)`.
      deployedCode: bytecodeQuery.data ?? null,
      estateWei: balanceQuery.data?.value,
    }),
    refreshVault,
  };
}

/** The three chain answers, folded into the one state the interface renders from. */
function readVaultState({
  ownerAddress,
  derivedAddress,
  isReadingCode,
  hasCodeReadFailed,
  deployedCode,
  estateWei,
}: {
  ownerAddress: Address | undefined;
  derivedAddress: Address | undefined;
  isReadingCode: boolean;
  hasCodeReadFailed: boolean;
  deployedCode: Hex | null;
  estateWei: bigint | undefined;
}): TestamentVault {
  if (ownerAddress === undefined) {
    return { status: "no-owner" };
  }
  if (derivedAddress === undefined || isReadingCode) {
    return { status: "reading" };
  }
  if (hasCodeReadFailed) {
    return { status: "unreadable", address: derivedAddress };
  }
  if (deployedCode === null || deployedCode === "0x") {
    return { status: "absent", address: derivedAddress };
  }

  return { status: "present", address: derivedAddress, estateWei: estateWei ?? 0n };
}

/**
 * Deploys the owner's Testament vault as a 1-of-1 Safe.
 *
 * This is a proxy of Safe's audited singleton, created through Safe's own canonical factory:
 * no Safe code is deployed here, and no Safe backend is contacted, which is exactly why it
 * keeps working on days their app does not.
 *
 * The owner and threshold are read back from the chain before the address is returned. The
 * setup calldata is built in this process, so reading it back would only re-check our own
 * input; reading the deployed Safe catches the case that actually matters, a vault nobody
 * holds the key to, before anyone is invited to put an estate in it.
 */
export async function createTestamentVault({
  walletClient,
  publicClient,
  ownerAddress,
}: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  ownerAddress: Address;
}): Promise<WriteResult<{ address: Address; transactionHash: Hex }>> {
  const account = walletClient.account;
  if (account === undefined) {
    return { ok: false, failure: { reason: "not-connected" } };
  }

  try {
    const transactionHash = await walletClient.writeContract({
      account,
      chain: walletClient.chain,
      address: SAFE_PROXY_FACTORY,
      abi: safeProxyFactoryAbi,
      functionName: "createProxyWithNonce",
      args: [SAFE_SINGLETON, encodeSafeSetup(ownerAddress), TESTAMENT_SALT_NONCE],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== "success") {
      return { ok: false, failure: { reason: "reverted", step: "create-safe", transactionHash } };
    }

    const creationLogs = await publicClient.getLogs({
      address: SAFE_PROXY_FACTORY,
      event: SAFE_PROXY_CREATION_EVENT,
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    const created = creationLogs.find((entry) => entry.transactionHash === transactionHash);
    const safeAddress = created?.args.proxy;
    if (safeAddress === undefined) {
      return {
        ok: false,
        failure: { reason: "transaction-failed", detail: `no ProxyCreation event in ${transactionHash}` },
      };
    }

    const [owners, threshold] = await Promise.all([
      publicClient.readContract({
        address: safeAddress,
        abi: safeManagementAbi,
        functionName: "getOwners",
      }),
      publicClient.readContract({
        address: safeAddress,
        abi: safeManagementAbi,
        functionName: "getThreshold",
      }),
    ]);
    const hasExpectedSoleOwner =
      owners.length === 1 && owners[0]?.toLowerCase() === ownerAddress.toLowerCase();
    if (!hasExpectedSoleOwner || threshold !== EXPECTED_THRESHOLD) {
      return {
        ok: false,
        failure: { reason: "wrong-safe-owner", safeAddress },
      };
    }

    return { ok: true, value: { address: safeAddress, transactionHash } };
  } catch (error) {
    return { ok: false, failure: classifyTransactionThrow(error, "create-safe") };
  }
}

/**
 * Sends ETH from the connected wallet into the vault.
 *
 * A plain transfer, which is the whole point: the estate is ordinary ETH sitting in an
 * ordinary Safe, and the owner can move it back out through Safe at any time.
 */
export async function fundTestamentVault({
  walletClient,
  publicClient,
  safeAddress,
  amountEth,
}: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  safeAddress: Address;
  amountEth: string;
}): Promise<WriteResult<Hex>> {
  const account = walletClient.account;
  if (account === undefined) {
    return { ok: false, failure: { reason: "not-connected" } };
  }

  let amountWei: bigint;
  try {
    amountWei = parseEther(amountEth);
  } catch {
    return { ok: false, failure: { reason: "invalid-amount" } };
  }
  if (amountWei <= 0n) {
    return { ok: false, failure: { reason: "invalid-amount" } };
  }

  try {
    // A plain transfer to an address with no code succeeds and proves nothing: 0.02 ETH once
    // landed at a vault address whose Safe was never deployed, and only the seal's revert
    // said so. The estate moves only into a contract that exists to hold it.
    const deployedCode = await publicClient.getCode({ address: safeAddress });
    if (deployedCode === undefined || deployedCode === "0x") {
      return { ok: false, failure: { reason: "safe-not-a-contract", safeAddress } };
    }

    const transactionHash = await walletClient.sendTransaction({
      account,
      chain: walletClient.chain,
      to: safeAddress,
      value: amountWei,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== "success") {
      return { ok: false, failure: { reason: "reverted", step: "fund-safe", transactionHash } };
    }
    return { ok: true, value: transactionHash };
  } catch (error) {
    return { ok: false, failure: classifyTransactionThrow(error, "fund-safe") };
  }
}
