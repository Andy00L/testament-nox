import { createViemHandleClient } from "@iexec-nox/handle";
import {
  SLOT_COUNT,
  TESTAMENT_STATE,
  buildAuthorizeWriterTransaction,
  collectDecryptionProofs,
  computePayout,
  describePackFailure,
  encryptTestamentSlots,
  packBequests,
  retryAsync,
  safeManagementAbi,
  sleep,
  testamentRegistryAbi,
} from "@testament/shared";
import hre from "hardhat";
import { formatEther, getAddress, type Address, type Hex } from "viem";

/**
 * The failure half of the life cycle, on Ethereum Sepolia and for real.
 *
 * `e2e-sepolia.ts` proves the happy path: every heir takes their share and the will finishes
 * in one transaction. This proves the other half, which is the harder promise: an heir whose
 * wallet cannot accept ETH does not lose their inheritance and does not strand anyone else's.
 *
 * One heir is a contract that refuses the transfer. The estate pays everyone it can reach,
 * records the refusal, and stops at `PartiallyExecuted` with the refused share still sitting
 * in the Safe. The heir then fixes their wallet and anyone at all settles the debt with
 * `retryPayment`, which takes only an id and a slot and so cannot redirect or resize anything.
 *
 * Run with: bun run demo-retry:sepolia
 */

function requireEnv(variableName: string): string {
  const raw = process.env[variableName];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`[demoRetry] ${variableName} is not set in packages/contracts/.env`);
  }
  return raw.trim();
}

function requireEnvAddress(variableName: string): Address {
  return getAddress(requireEnv(variableName));
}

function requireEnvSeconds(variableName: string): number {
  const parsed = Number(requireEnv(variableName));
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`[demoRetry] ${variableName} must be a positive whole number of seconds`);
  }
  return parsed;
}

const registryAddress = requireEnvAddress("REGISTRY_ADDRESS");
const moduleAddress = requireEnvAddress("MODULE_ADDRESS");
const safeAddress = requireEnvAddress("SAFE_ADDRESS");
const willingHeir = requireEnvAddress("BENEFICIARY_A");
const intervalSeconds = requireEnvSeconds("DEMO_INTERVAL");
const graceSeconds = requireEnvSeconds("DEMO_GRACE");

/** Shares for the demo. The refusing heir holds the larger one so the gap is obvious. */
const WILLING_SHARE_BPS = 4000;
const REFUSING_SHARE_BPS = 6000;

/** The slot the refusing heir sits in. Index 1, because the willing heir takes index 0. */
const REFUSING_SLOT = 1;

/** Slack past the deadline, for the same block-timestamp reason as the e2e script. */
const RELEASE_MARGIN_SECONDS = 24;

/** What the Safe is topped up to before the run. Unit: wei. */
const ESTATE_WEI = 20_000_000_000_000_000n; // 0.02 ETH

const connection = await hre.network.getOrCreate();
const { viem, networkName } = connection;

const publicClient = await viem.getPublicClient();
const [ownerWallet] = await viem.getWalletClients();
if (ownerWallet === undefined) {
  throw new Error("[demoRetry] no wallet configured, check DEPLOYER_PRIVATE_KEY");
}
const ownerAddress = ownerWallet.account.address;

console.log(`[demoRetry] network  ${networkName}`);
console.log(`[demoRetry] registry ${registryAddress}`);
console.log(`[demoRetry] safe     ${safeAddress}`);

// ---- The heir who cannot be paid ------------------------------------------------------

const refusingHeir = await viem.deployContract("RejectingReceiver", []);
console.log(`[demoRetry] refusing heir deployed at ${refusingHeir.address}`);

// ---- Preflight ------------------------------------------------------------------------

const moduleEnabled = await publicClient.readContract({
  address: safeAddress,
  abi: safeManagementAbi,
  functionName: "isModuleEnabled",
  args: [moduleAddress],
});
if (!moduleEnabled) {
  throw new Error(`[demoRetry] the Safe has not enabled ${moduleAddress}`);
}

const existingId = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "activeTestamentOf",
  args: [ownerAddress],
});
if (existingId !== 0n) {
  console.log(`[demoRetry] revoking leftover testament #${existingId}`);
  const revokeHash = await ownerWallet.writeContract({
    address: registryAddress,
    abi: testamentRegistryAbi,
    functionName: "revoke",
    args: [existingId],
  });
  await publicClient.waitForTransactionReceipt({ hash: revokeHash });
}

// A mandate buys one will, so the Safe grants a fresh one for this run.
console.log("[demoRetry] the Safe names its writer");
const authorizeHash = await ownerWallet.writeContract(
  buildAuthorizeWriterTransaction(safeAddress, moduleAddress, ownerAddress, ownerAddress),
);
await publicClient.waitForTransactionReceipt({ hash: authorizeHash });
console.log(`[demoRetry] authorize ${authorizeHash}`);

let estateValueWei = await publicClient.getBalance({ address: safeAddress });
if (estateValueWei < ESTATE_WEI) {
  const topUpHash = await ownerWallet.sendTransaction({
    to: safeAddress,
    value: ESTATE_WEI - estateValueWei,
  });
  await publicClient.waitForTransactionReceipt({ hash: topUpHash });
  estateValueWei = await publicClient.getBalance({ address: safeAddress });
}
console.log(`[demoRetry] estate   ${formatEther(estateValueWei)} ETH`);

// ---- Write --------------------------------------------------------------------------

const packed = packBequests([
  { beneficiary: willingHeir, shareBps: WILLING_SHARE_BPS },
  { beneficiary: refusingHeir.address, shareBps: REFUSING_SHARE_BPS },
]);
if (!packed.ok) {
  throw new Error(`[demoRetry] ${describePackFailure(packed.failure)}`);
}

const handleClient = await createViemHandleClient(ownerWallet);
console.log(`[demoRetry] encrypting ${SLOT_COUNT} slots through the Handle Gateway`);
const encrypted = await encryptTestamentSlots(packed.slots, (slotValue) =>
  handleClient.encryptInput(slotValue, "uint256", registryAddress),
);
if (!encrypted.ok) {
  throw new Error(`[demoRetry] slot ${encrypted.failure.slotIndex}: ${encrypted.failure.message}`);
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
await publicClient.waitForTransactionReceipt({ hash: writeHash });
console.log(`[demoRetry] write     ${writeHash}`);

const testamentId = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "lastTestamentId",
});
console.log(`[demoRetry] testament #${testamentId}`);

// ---- Silence, then release ------------------------------------------------------------

const deadline = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "deadlineOf",
  args: [testamentId],
});
const latestBlock = await publicClient.getBlock();
const waitSeconds = Number(deadline - latestBlock.timestamp) + RELEASE_MARGIN_SECONDS;
console.log(`[demoRetry] waiting ${waitSeconds}s for the wind to fall`);
for (let elapsed = 0; elapsed < waitSeconds; elapsed += 15) {
  await sleep(Math.min(15_000, (waitSeconds - elapsed) * 1_000));
}

const releaseHash = await ownerWallet.writeContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "release",
  args: [testamentId],
});
await publicClient.waitForTransactionReceipt({ hash: releaseHash });
console.log(`[demoRetry] release   ${releaseHash}`);

// ---- Execute, and watch one heir refuse ------------------------------------------------

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
  throw new Error(`[demoRetry] slot ${collected.failure.slotIndex}: ${collected.failure.message}`);
}

const executeHash = await ownerWallet.writeContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "execute",
  args: [testamentId, collected.proofs],
});
const executeReceipt = await publicClient.waitForTransactionReceipt({ hash: executeHash });
console.log(`[demoRetry] execute   ${executeHash} (gas ${executeReceipt.gasUsed})`);

const afterExecution = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "testamentOf",
  args: [testamentId],
});
if (afterExecution[5] !== TESTAMENT_STATE.PartiallyExecuted) {
  throw new Error(`[demoRetry] expected PartiallyExecuted, got state ${afterExecution[5]}`);
}
const owedAfterExecution = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "unpaidSlots",
  args: [testamentId],
});
console.log(
  `[demoRetry] partially executed, slot ${REFUSING_SLOT} still owed (unpaid bitmap ${owedAfterExecution})`,
);
console.log(
  `[demoRetry] the refused share stayed in the Safe: ${formatEther(
    await publicClient.getBalance({ address: safeAddress }),
  )} ETH`,
);

// ---- The heir fixes their wallet, and anyone settles the debt ---------------------------

const acceptHash = await refusingHeir.write.setAccepts([true]);
await publicClient.waitForTransactionReceipt({ hash: acceptHash });
console.log(`[demoRetry] the heir can now accept ETH: ${acceptHash}`);

const retryHash = await ownerWallet.writeContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "retryPayment",
  args: [testamentId, REFUSING_SLOT],
});
const retryReceipt = await publicClient.waitForTransactionReceipt({ hash: retryHash });
console.log(`[demoRetry] retry     ${retryHash} (gas ${retryReceipt.gasUsed})`);

// ---- Check ------------------------------------------------------------------------------

const finalState = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "testamentOf",
  args: [testamentId],
});
const heirBalance = await publicClient.getBalance({ address: refusingHeir.address });
const expected = computePayout(estateValueWei, REFUSING_SHARE_BPS);

console.log(`[demoRetry] the heir received ${formatEther(heirBalance)} ETH, expected ${formatEther(expected)}`);

if (heirBalance !== expected) {
  throw new Error("[demoRetry] the retried payment does not match the will");
}
if (finalState[5] !== TESTAMENT_STATE.Executed) {
  throw new Error(`[demoRetry] expected Executed, got state ${finalState[5]}`);
}

console.log("[demoRetry] refused, then settled. The estate is finished.");
console.log(`[demoRetry] etherscan https://sepolia.etherscan.io/tx/${retryHash}`);

await connection.close();
