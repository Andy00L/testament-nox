import { createViemHandleClient } from "@iexec-nox/handle";
import {
  SLOT_COUNT,
  TESTAMENT_STATE,
  collectDecryptionProofs,
  computePayout,
  describePackFailure,
  encryptTestamentSlots,
  packBequests,
  retryAsync,
  safeManagementAbi,
  sleep,
  testamentModuleAbi,
  testamentRegistryAbi,
  unpackBequest,
} from "@testament/shared";
import hre from "hardhat";
import { formatEther, getAddress, type Address, type Hex } from "viem";

/**
 * The whole life cycle on Ethereum Sepolia, against the deployed contracts and a real Safe:
 * write, heartbeat, wait out the silence, release, decrypt, execute, check the payouts.
 *
 * This is the "works end to end, no mock data" proof and the rehearsal for the demo video.
 * Run with: bun run e2e:sepolia
 */

function requireEnv(variableName: string): string {
  const raw = process.env[variableName];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`[e2e] ${variableName} is not set in packages/contracts/.env`);
  }
  return raw.trim();
}

function requireEnvAddress(variableName: string): Address {
  return getAddress(requireEnv(variableName));
}

function requireEnvSeconds(variableName: string): number {
  const parsed = Number(requireEnv(variableName));
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`[e2e] ${variableName} must be a positive whole number of seconds`);
  }
  return parsed;
}

const registryAddress = requireEnvAddress("REGISTRY_ADDRESS");
const moduleAddress = requireEnvAddress("MODULE_ADDRESS");
const safeAddress = requireEnvAddress("SAFE_ADDRESS");
const beneficiaryA = requireEnvAddress("BENEFICIARY_A");
const beneficiaryB = requireEnvAddress("BENEFICIARY_B");
const intervalSeconds = requireEnvSeconds("DEMO_INTERVAL");
const graceSeconds = requireEnvSeconds("DEMO_GRACE");

/** Shares used by the rehearsal. Unit: bps. */
const SHARE_A_BPS = 6000;
const SHARE_B_BPS = 4000;

/** Slack added to the on-chain deadline before calling release. Unit: seconds. */
const RELEASE_MARGIN_SECONDS = 5;

/** Below this the Safe is topped up before the run. Unit: wei. */
const MINIMUM_ESTATE_WEI = 5_000_000_000_000_000n; // 0.005 ETH

/** What the Safe is topped up to. Unit: wei. */
const TOP_UP_ESTATE_WEI = 20_000_000_000_000_000n; // 0.02 ETH

const connection = await hre.network.getOrCreate();
const { viem, networkName } = connection;

const publicClient = await viem.getPublicClient();
const [ownerWallet] = await viem.getWalletClients();
if (ownerWallet === undefined) {
  throw new Error("[e2e] no wallet configured, check DEPLOYER_PRIVATE_KEY");
}
const ownerAddress = ownerWallet.account.address;

console.log(`[e2e] network  ${networkName}`);
console.log(`[e2e] registry ${registryAddress}`);
console.log(`[e2e] safe     ${safeAddress}`);
console.log(`[e2e] owner    ${ownerAddress}`);

// ---- Preflight ----------------------------------------------------------------------

const moduleEnabled = await publicClient.readContract({
  address: safeAddress,
  abi: safeManagementAbi,
  functionName: "isModuleEnabled",
  args: [moduleAddress],
});
if (!moduleEnabled) {
  throw new Error(
    `[e2e] the Safe has not enabled ${moduleAddress}. Run: bun run enable-module:sepolia`,
  );
}

// Enabling the module is not consent to any particular will. The Safe also has to name its
// writer, and the will carries the nonce that naming landed on.
const [mandatedWriter, mandateNonce] = await publicClient.readContract({
  address: moduleAddress,
  abi: testamentModuleAbi,
  functionName: "authorizationOf",
  args: [safeAddress],
});
if (mandatedWriter.toLowerCase() !== ownerAddress.toLowerCase()) {
  throw new Error(
    `[e2e] the Safe's writer is ${mandatedWriter}, not ${ownerAddress}. Run: bun run authorize-writer:sepolia`,
  );
}
console.log(`[e2e] mandate  nonce ${mandateNonce}`);

let estateValueWei = await publicClient.getBalance({ address: safeAddress });
if (estateValueWei < MINIMUM_ESTATE_WEI) {
  // A previous run drained it. Top it back up so the rehearsal is repeatable.
  console.log(`[e2e] refilling the Safe to ${formatEther(TOP_UP_ESTATE_WEI)} ETH`);
  const topUpHash = await ownerWallet.sendTransaction({
    to: safeAddress,
    value: TOP_UP_ESTATE_WEI - estateValueWei,
  });
  await publicClient.waitForTransactionReceipt({ hash: topUpHash });
  estateValueWei = await publicClient.getBalance({ address: safeAddress });
}
console.log(`[e2e] estate   ${formatEther(estateValueWei)} ETH`);

// A previous run may have left an active testament behind.
const existingId = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "activeTestamentOf",
  args: [ownerAddress],
});
if (existingId !== 0n) {
  console.log(`[e2e] revoking leftover testament #${existingId}`);
  const revokeHash = await ownerWallet.writeContract({
    address: registryAddress,
    abi: testamentRegistryAbi,
    functionName: "revoke",
    args: [existingId],
  });
  await publicClient.waitForTransactionReceipt({ hash: revokeHash });
}

// One Safe backs one will at a time. If something else still holds the slot the run cannot
// start, and saying which testament it is beats a bare SafeAlreadyHasTestament revert.
const safeHeldId = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "activeTestamentOfSafe",
  args: [safeAddress],
});
if (safeHeldId !== 0n) {
  throw new Error(
    `[e2e] testament #${safeHeldId} is still active against ${safeAddress} and belongs to someone else. Its owner has to revoke it, or the Safe has to rotate its mandate.`,
  );
}

// ---- Write --------------------------------------------------------------------------

const packed = packBequests([
  { beneficiary: beneficiaryA, shareBps: SHARE_A_BPS },
  { beneficiary: beneficiaryB, shareBps: SHARE_B_BPS },
]);
if (!packed.ok) {
  throw new Error(`[e2e] ${describePackFailure(packed.failure)}`);
}

const handleClient = await createViemHandleClient(ownerWallet);

console.log(`[e2e] encrypting ${SLOT_COUNT} slots through the Handle Gateway`);
const encrypted = await encryptTestamentSlots(packed.slots, (slotValue) =>
  handleClient.encryptInput(slotValue, "uint256", registryAddress),
);
if (!encrypted.ok) {
  throw new Error(`[e2e] slot ${encrypted.failure.slotIndex}: ${encrypted.failure.message}`);
}

const writeHash = await ownerWallet.writeContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "write",
  args: [
    safeAddress,
    intervalSeconds,
    graceSeconds,
    encrypted.encryptions.handles,
    encrypted.encryptions.proofs,
  ],
});
const writeReceipt = await publicClient.waitForTransactionReceipt({ hash: writeHash });
console.log(`[e2e] write     ${writeHash} (gas ${writeReceipt.gasUsed})`);

const testamentId = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "lastTestamentId",
});
console.log(`[e2e] testament #${testamentId}`);

// ---- Heartbeat ----------------------------------------------------------------------

const heartbeatHash = await ownerWallet.writeContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "heartbeat",
  args: [testamentId],
});
await publicClient.waitForTransactionReceipt({ hash: heartbeatHash });
console.log(`[e2e] heartbeat ${heartbeatHash}`);

// ---- Silence ------------------------------------------------------------------------

const deadline = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "deadlineOf",
  args: [testamentId],
});

const latestBlock = await publicClient.getBlock();
const waitSeconds = Number(deadline - latestBlock.timestamp) + RELEASE_MARGIN_SECONDS;
console.log(`[e2e] waiting ${waitSeconds}s for the wind to fall`);
for (let elapsed = 0; elapsed < waitSeconds; elapsed += 15) {
  await sleep(Math.min(15_000, (waitSeconds - elapsed) * 1_000));
  console.log(`[e2e]   ${Math.min(elapsed + 15, waitSeconds)}/${waitSeconds}s`);
}

// ---- Release ------------------------------------------------------------------------

const releaseHash = await ownerWallet.writeContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "release",
  args: [testamentId],
});
const releaseReceipt = await publicClient.waitForTransactionReceipt({ hash: releaseHash });
console.log(`[e2e] release   ${releaseHash} (gas ${releaseReceipt.gasUsed})`);

// ---- Decrypt ------------------------------------------------------------------------

const slotHandles = (await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "slotsOf",
  args: [testamentId],
})) as readonly Hex[];

console.log("[e2e] fetching decryption proofs");
const collected = await collectDecryptionProofs([...slotHandles], async (slotHandle) => {
  const attempt = await retryAsync(() => handleClient.publicDecrypt(slotHandle), {
    onRetry: (attemptNumber) =>
      console.log(`[e2e]   slot not resolved yet, retry ${attemptNumber}`),
  });
  if (!attempt.ok) {
    throw attempt.lastError;
  }
  return attempt.value.decryptionProof;
});
if (!collected.ok) {
  throw new Error(`[e2e] slot ${collected.failure.slotIndex}: ${collected.failure.message}`);
}

for (const [slotIndex, slotHandle] of slotHandles.entries()) {
  const { value } = await handleClient.publicDecrypt(slotHandle);
  const bequest = unpackBequest(value as bigint);
  console.log(`[e2e]   slot ${slotIndex}: ${bequest.beneficiary} ${bequest.shareBps} bps`);
}

// ---- Execute ------------------------------------------------------------------------

const executeHash = await ownerWallet.writeContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "execute",
  args: [testamentId, collected.proofs],
});
const executeReceipt = await publicClient.waitForTransactionReceipt({ hash: executeHash });
console.log(`[e2e] execute   ${executeHash} (gas ${executeReceipt.gasUsed})`);

/**
 * Balances are read at pinned block numbers, never at "latest".
 *
 * A public RPC endpoint is usually a load balancer over many nodes, so two consecutive
 * "latest" reads can land on nodes at different heights: the first run of this script
 * reported one heir as unpaid while the transaction receipt showed both Distributed events
 * and the Safe drained to zero. Pinning the block makes the check deterministic.
 */
const blockBeforeExecute = executeReceipt.blockNumber - 1n;
const [balanceABefore, balanceBBefore, balanceAAfter, balanceBAfter, estateAtExecution] =
  await Promise.all([
    publicClient.getBalance({ address: beneficiaryA, blockNumber: blockBeforeExecute }),
    publicClient.getBalance({ address: beneficiaryB, blockNumber: blockBeforeExecute }),
    publicClient.getBalance({ address: beneficiaryA, blockNumber: executeReceipt.blockNumber }),
    publicClient.getBalance({ address: beneficiaryB, blockNumber: executeReceipt.blockNumber }),
    publicClient.getBalance({ address: safeAddress, blockNumber: blockBeforeExecute }),
  ]);

const receivedA = balanceAAfter - balanceABefore;
const receivedB = balanceBAfter - balanceBBefore;
// The contract snapshots the Safe balance inside execute, so the expectation is computed
// against the balance one block earlier, not against the balance the script saw at startup.
const expectedA = computePayout(estateAtExecution, SHARE_A_BPS);
const expectedB = computePayout(estateAtExecution, SHARE_B_BPS);

console.log(`[e2e] ${beneficiaryA} received ${formatEther(receivedA)} ETH, expected ${formatEther(expectedA)}`);
console.log(`[e2e] ${beneficiaryB} received ${formatEther(receivedB)} ETH, expected ${formatEther(expectedB)}`);

const finalState = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "testamentOf",
  args: [testamentId],
});

if (receivedA !== expectedA || receivedB !== expectedB) {
  throw new Error("[e2e] payouts do not match the will");
}
if (finalState[5] !== TESTAMENT_STATE.Executed) {
  throw new Error(`[e2e] expected state Executed, got ${finalState[5]}`);
}

console.log("[e2e] life cycle complete");
console.log(`[e2e] etherscan https://sepolia.etherscan.io/tx/${executeHash}`);

await connection.close();
