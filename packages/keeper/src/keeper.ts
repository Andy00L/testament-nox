import { createViemHandleClient } from "@iexec-nox/handle";
import {
  SLOT_COUNT,
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
 * deadline has passed, pays out the ones already released, and pushes again at any heir a
 * payout could not reach the first time.
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

/**
 * Ids requested per read. The registry clamps the upper bound to what exists, so the last
 * page is short rather than wasteful.
 *
 * A fixed ceiling here used to mean testaments past it were never settled by this keeper.
 * The scan now walks to `lastTestamentId` instead, so the registry decides how far it goes.
 */
const SCAN_PAGE_SIZE = 200n;

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

/**
 * Walks one of the registry's batch views from id 1 to whatever exists right now.
 *
 * Paged rather than one huge call, because a single view over thousands of ids eventually
 * exceeds the node's gas cap for an `eth_call` and starts returning nothing at all.
 */
async function scanIds(
  viewName: "releasableIds" | "executableIds" | "retryableIds",
): Promise<bigint[]> {
  const lastTestamentId = await publicClient.readContract({
    address: registryAddress,
    abi: testamentRegistryAbi,
    functionName: "lastTestamentId",
  });

  const found: bigint[] = [];
  for (let fromId = 1n; fromId <= lastTestamentId; fromId += SCAN_PAGE_SIZE) {
    const page = await publicClient.readContract({
      address: registryAddress,
      abi: testamentRegistryAbi,
      functionName: viewName,
      args: [fromId, fromId + SCAN_PAGE_SIZE - 1n],
    });
    found.push(...withoutPadding(page));
  }
  return found;
}

async function releaseExpiredTestaments(): Promise<void> {
  const candidates = await scanIds("releasableIds");

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
  const candidates = await scanIds("executableIds");

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
      // Two reverts are expected rather than exceptional here, and both are the system
      // working: an unfunded Safe reverts so the payout stays retryable, and a Safe that
      // withdrew or reassigned its mandate reverts so a stale will can never be settled.
      console.warn(`[keeper] execute #${testamentId} failed: ${describeError(error)}`);
    }
  }
}

/**
 * Pushes the heirs a settled will still owes.
 *
 * An heir whose wallet refused the transfer keeps their share in the Safe, and the debt stays
 * open until someone pays the gas to try again. Nothing here can change who is owed or how
 * much: the registry settled that when the will was executed, and a retry names only a slot.
 *
 * A recipient that refuses for good is retried on every pass, which costs the keeper a failed
 * transaction each time. Acceptable for a demo; a long-running keeper would back off.
 */
async function settleOutstandingHeirs(): Promise<void> {
  const candidates = await scanIds("retryableIds");

  for (const testamentId of candidates) {
    const outstanding = await publicClient.readContract({
      address: registryAddress,
      abi: testamentRegistryAbi,
      functionName: "unpaidSlots",
      args: [testamentId],
    });

    for (let slot = 0; slot < SLOT_COUNT; slot += 1) {
      if ((outstanding & (1 << slot)) === 0) {
        continue;
      }
      try {
        const transactionHash = await walletClient.writeContract({
          address: registryAddress,
          abi: testamentRegistryAbi,
          functionName: "retryPayment",
          args: [testamentId, slot],
        });
        await publicClient.waitForTransactionReceipt({ hash: transactionHash });
        console.log(`[keeper] settled #${testamentId} slot ${slot} ${transactionHash}`);
      } catch (error) {
        console.warn(
          `[keeper] retry #${testamentId} slot ${slot} failed: ${describeError(error)}`,
        );
      }
    }
  }
}

async function runOnePass(): Promise<void> {
  await releaseExpiredTestaments();
  await executeReleasedTestaments();
  await settleOutstandingHeirs();
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
