import { nox } from "@iexec-nox/nox-hardhat-plugin";
import {
  SLOT_COUNT,
  collectDecryptionProofs,
  encryptTestamentSlots,
  packBequests,
  testamentModuleAbi,
  type Bequest,
} from "@testament/shared";
import { encodeFunctionData, type Address, type Hex } from "viem";

import { deployTestamentSystem } from "../../lib/deployment.ts";

/**
 * Everything a registry test needs: the deployed pair, a funded MockSafe that has enabled
 * the module and authorized the owner as its writer, and the wallets. The first wallet is
 * always the testament owner, because Nox binds an input proof to the wallet that encrypted
 * it and the plugin's `nox.encryptInput` signs with that first account.
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
  authorizeOwner = true,
}: { estateWei?: bigint; enableModule?: boolean; authorizeOwner?: boolean } = {}) {
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

  // A real Safe reaches authorizeWriter through execTransaction, once enough owners have
  // signed. The mock skips the signature check and calls with itself as msg.sender, which is
  // the only part the module actually reads. Gated on enableModule because the module
  // refuses a mandate on a Safe that has not enabled it.
  if (enableModule && authorizeOwner) {
    const authorizeHash = await safe.write.executeAsSafe([
      module.address,
      encodeFunctionData({
        abi: testamentModuleAbi,
        functionName: "authorizeWriter",
        args: [ownerWallet.account.address],
      }),
    ]);
    await publicClient.waitForTransactionReceipt({ hash: authorizeHash });
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
 * Hands the Safe's mandate to `writerAddress`, replacing whoever held it and bumping the
 * authorization nonce. Mirrors a Safe transaction that cleared its threshold.
 */
export async function authorizeWriterOnSafe(
  fixture: TestamentFixture,
  writerAddress: Address,
): Promise<void> {
  const hash = await fixture.safe.write.executeAsSafe([
    fixture.module.address,
    encodeFunctionData({
      abi: testamentModuleAbi,
      functionName: "authorizeWriter",
      args: [writerAddress],
    }),
  ]);
  await fixture.publicClient.waitForTransactionReceipt({ hash });
}

/** Withdraws the Safe's mandate, disarming any testament written under it. */
export async function revokeWriterOnSafe(fixture: TestamentFixture): Promise<void> {
  const hash = await fixture.safe.write.executeAsSafe([
    fixture.module.address,
    encodeFunctionData({ abi: testamentModuleAbi, functionName: "revokeWriter" }),
  ]);
  await fixture.publicClient.waitForTransactionReceipt({ hash });
}

/**
 * Encrypts a will and writes it, returning the new testament id.
 * `rawSlots` bypasses the client-side validation so tests can submit a malformed will
 * (over-allocated shares, for instance) and check the on-chain defences.
 *
 * `account` sends the transaction from someone other than the owner. The slots are still
 * encrypted by the plugin's first account, which is fine for the authorization tests:
 * `write` settles the mandate before it ever looks at a proof.
 */
export async function writeTestament(
  fixture: TestamentFixture,
  {
    bequests,
    rawSlots,
    interval = TEST_INTERVAL_SECONDS,
    grace = TEST_GRACE_SECONDS,
    safeAddress,
    account,
  }: {
    bequests?: readonly Bequest[];
    rawSlots?: readonly bigint[];
    interval?: number;
    grace?: number;
    safeAddress?: Address;
    account?: TestamentFixture["ownerWallet"]["account"];
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

  const writeHash = await fixture.registry.write.write(
    [
      safeAddress ?? fixture.safe.address,
      interval,
      grace,
      encrypted.encryptions.handles,
      encrypted.encryptions.proofs,
    ],
    account === undefined ? {} : { account },
  );
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
