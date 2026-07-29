import { nox } from "@iexec-nox/nox-hardhat-plugin";
import {
  SLOT_COUNT,
  collectDecryptionProofs,
  encryptTestamentSlots,
  packBequests,
  type Bequest,
} from "@testament/shared";
import type { Address, Hex } from "viem";

import { deployTestamentSystem } from "../../lib/deployment.ts";

/**
 * Everything a registry test needs: the deployed pair, a funded MockSafe with the module
 * already enabled, and the wallets. The first wallet is always the testament owner,
 * because Nox binds an input proof to the wallet that encrypted it and the plugin's
 * `nox.encryptInput` signs with that first account.
 * sourceRef: docs.noxprotocol.io /references/solidity-library/methods/core-primitives/fromExternal
 */
export type TestamentFixture = Awaited<ReturnType<typeof deployTestamentFixture>>;

/** Estate the MockSafe holds in tests. Unit: wei (1 ETH). */
export const DEFAULT_ESTATE_WEI = 1_000_000_000_000_000_000n;

/** Heartbeat interval used by tests. Unit: seconds. Above MIN_INTERVAL (60). */
export const TEST_INTERVAL_SECONDS = 90;

/** Extra silence tolerated before release in tests. Unit: seconds. */
export const TEST_GRACE_SECONDS = 30;

export async function deployTestamentFixture({
  estateWei = DEFAULT_ESTATE_WEI,
  enableModule = true,
}: { estateWei?: bigint; enableModule?: boolean } = {}) {
  const connection = await nox.connect();
  const { viem, networkHelpers } = connection;

  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();
  const [ownerWallet] = walletClients;
  if (ownerWallet === undefined) {
    throw new Error("[deployTestamentFixture] no wallet clients available");
  }

  const deployment = await deployTestamentSystem(
    viem,
    publicClient,
    ownerWallet.account.address,
  );
  if (!deployment.ok) {
    throw new Error(
      `[deployTestamentFixture] ${deployment.failure.reason}: predicted ${deployment.failure.predicted}, got ${deployment.failure.actual}`,
    );
  }

  const module = await viem.getContractAt("TestamentModule", deployment.deployment.moduleAddress);
  const registry = await viem.getContractAt(
    "TestamentRegistry",
    deployment.deployment.registryAddress,
  );
  const safe = await viem.deployContract("MockSafe", []);

  if (enableModule) {
    const enableHash = await safe.write.enableModule([module.address]);
    await publicClient.waitForTransactionReceipt({ hash: enableHash });
  }

  if (estateWei > 0n) {
    const fundingHash = await ownerWallet.sendTransaction({
      to: safe.address,
      value: estateWei,
    });
    await publicClient.waitForTransactionReceipt({ hash: fundingHash });
  }

  return {
    connection,
    viem,
    networkHelpers,
    publicClient,
    walletClients,
    ownerWallet,
    module,
    registry,
    safe,
  };
}

/**
 * Encrypts a will and writes it, returning the new testament id.
 * `rawSlots` bypasses the client-side validation so tests can submit a malformed will
 * (over-allocated shares, for instance) and check the on-chain defences.
 */
export async function writeTestament(
  fixture: TestamentFixture,
  {
    bequests,
    rawSlots,
    interval = TEST_INTERVAL_SECONDS,
    grace = TEST_GRACE_SECONDS,
    safeAddress,
  }: {
    bequests?: readonly Bequest[];
    rawSlots?: readonly bigint[];
    interval?: number;
    grace?: number;
    safeAddress?: Address;
  },
): Promise<bigint> {
  const slotValues = rawSlots ?? resolveSlotValues(bequests);

  const encrypted = await encryptTestamentSlots(slotValues, (slotValue) =>
    nox.encryptInput(slotValue, "uint256", fixture.registry.address),
  );
  if (!encrypted.ok) {
    throw new Error(
      `[writeTestament] slot ${encrypted.failure.slotIndex}: ${encrypted.failure.message}`,
    );
  }

  const writeHash = await fixture.registry.write.write([
    safeAddress ?? fixture.safe.address,
    interval,
    grace,
    encrypted.encryptions.handles,
    encrypted.encryptions.proofs,
  ]);
  await fixture.publicClient.waitForTransactionReceipt({ hash: writeHash });

  return fixture.registry.read.lastTestamentId() as Promise<bigint>;
}

function resolveSlotValues(bequests: readonly Bequest[] | undefined): bigint[] {
  if (bequests === undefined) {
    throw new Error("[resolveSlotValues] pass either bequests or rawSlots");
  }
  const packed = packBequests(bequests);
  if (!packed.ok) {
    throw new Error(`[resolveSlotValues] ${packed.failure.reason}`);
  }
  return packed.slots;
}

/** Pads a partial list of raw slot values up to SLOT_COUNT with encrypted zeros. */
export function padRawSlots(slotValues: readonly bigint[]): bigint[] {
  return Array.from({ length: SLOT_COUNT }, (_unused, index) => slotValues[index] ?? 0n);
}

/** Fetches one decryption proof per slot of a released testament. */
export async function fetchSlotProofs(slotHandles: readonly Hex[]): Promise<Hex[]> {
  const collected = await collectDecryptionProofs(slotHandles, async (slotHandle) => {
    const { decryptionProof } = await nox.publicDecrypt(slotHandle);
    return decryptionProof;
  });
  if (!collected.ok) {
    throw new Error(
      `[fetchSlotProofs] slot ${collected.failure.slotIndex}: ${collected.failure.message}`,
    );
  }
  return collected.proofs;
}
