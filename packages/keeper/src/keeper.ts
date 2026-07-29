import { createViemHandleClient } from "@iexec-nox/handle";
import {
  collectDecryptionProofs,
  retryAsync,
  sleep,
  testamentRegistryAbi,
} from "@testament/shared";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia } from "viem/chains";

/**
 * Watches TestamentRegistry and finishes what silence started: releases testaments whose
 * deadline has passed, then pays out the ones already released.
 *
 * The keeper has no authority. `release` is permissionless once expired, and `execute`
 * verifies every decryption proof on-chain, so a keeper that lies, stalls, or disappears
 * changes nothing except how fast a will is settled. Anyone can do exactly the same work
 * from the app, which is the point.
 *
 * Run with: bun run --cwd packages/keeper start
 *           bun run --cwd packages/keeper once   (single pass, for CI cron)
 */

/** How long to wait between passes when running as a loop. Unit: milliseconds. */
const POLL_INTERVAL_MS = Number(process.env.KEEPER_POLL_INTERVAL_MS ?? 60_000);

/** Highest testament id scanned per pass. The registry clamps to what exists. */
const SCAN_UPPER_BOUND = 1_000n;

function requireEnv(variableName: string): string {
  const raw = process.env[variableName];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`[keeper] ${variableName} is not set`);
  }
  return raw.trim();
}

const rpcUrl = requireEnv("SEPOLIA_RPC_URL");
const registryAddress: Address = getAddress(requireEnv("REGISTRY_ADDRESS"));
const keeperPrivateKey = requireEnv("KEEPER_PRIVATE_KEY");
if (!keeperPrivateKey.startsWith("0x")) {
  throw new Error("[keeper] KEEPER_PRIVATE_KEY must be 0x-prefixed");
}

const keeperAccount = privateKeyToAccount(keeperPrivateKey as Hex);

const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const walletClient = createWalletClient({
  account: keeperAccount,
  chain: sepolia,
  transport: http(rpcUrl),
});
const handleClient = await createViemHandleClient(walletClient);

console.log(`[keeper] registry ${registryAddress}`);
console.log(`[keeper] account  ${keeperAccount.address}`);

/** Drops the zero padding the registry's batch views return. */
function withoutPadding(ids: readonly bigint[]): bigint[] {
  return ids.filter((testamentId) => testamentId !== 0n);
}

async function releaseExpiredTestaments(): Promise<void> {
  const candidates = withoutPadding(
    await publicClient.readContract({
      address: registryAddress,
      abi: testamentRegistryAbi,
      functionName: "releasableIds",
      args: [1n, SCAN_UPPER_BOUND],
    }),
  );

  for (const testamentId of candidates) {
    try {
      const transactionHash = await walletClient.writeContract({
        address: registryAddress,
        abi: testamentRegistryAbi,
        functionName: "release",
        args: [testamentId],
      });
      await publicClient.waitForTransactionReceipt({ hash: transactionHash });
      console.log(`[keeper] released #${testamentId} ${transactionHash}`);
    } catch (error) {
      // Someone else may have released it first, which is a fine outcome.
      console.warn(`[keeper] release #${testamentId} failed: ${describeError(error)}`);
    }
  }
}

async function executeReleasedTestaments(): Promise<void> {
  const candidates = withoutPadding(
    await publicClient.readContract({
      address: registryAddress,
      abi: testamentRegistryAbi,
      functionName: "executableIds",
      args: [1n, SCAN_UPPER_BOUND],
    }),
  );

  for (const testamentId of candidates) {
    try {
      const slotHandles = (await publicClient.readContract({
        address: registryAddress,
        abi: testamentRegistryAbi,
        functionName: "slotsOf",
        args: [testamentId],
      })) as readonly Hex[];

      const collected = await collectDecryptionProofs([...slotHandles], async (slotHandle) => {
        const attempt = await retryAsync(() => handleClient.publicDecrypt(slotHandle));
        if (!attempt.ok) {
          throw attempt.lastError;
        }
        return attempt.value.decryptionProof;
      });
      if (!collected.ok) {
        console.warn(
          `[keeper] #${testamentId} slot ${collected.failure.slotIndex} not decryptable yet: ${collected.failure.message}`,
        );
        continue;
      }

      const transactionHash = await walletClient.writeContract({
        address: registryAddress,
        abi: testamentRegistryAbi,
        functionName: "execute",
        args: [testamentId, collected.proofs],
      });
      await publicClient.waitForTransactionReceipt({ hash: transactionHash });
      console.log(`[keeper] executed #${testamentId} ${transactionHash}`);
    } catch (error) {
      // An unfunded Safe reverts on purpose so the payout stays retryable.
      console.warn(`[keeper] execute #${testamentId} failed: ${describeError(error)}`);
    }
  }
}

async function runOnePass(): Promise<void> {
  await releaseExpiredTestaments();
  await executeReleasedTestaments();
}

function describeError(thrown: unknown): string {
  if (thrown instanceof Error) {
    return thrown.message.split("\n")[0] ?? thrown.message;
  }
  return String(thrown);
}

const runOnce = process.argv.includes("--once");

if (runOnce) {
  await runOnePass();
  console.log("[keeper] single pass done");
} else {
  console.log(`[keeper] polling every ${POLL_INTERVAL_MS}ms`);
  for (;;) {
    await runOnePass();
    await sleep(POLL_INTERVAL_MS);
  }
}
