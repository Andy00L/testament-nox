import { createViemHandleClient } from "@iexec-nox/handle";
import {
  SLOT_COUNT,
  describePackFailure,
  encryptTestamentSlots,
  packBequests,
  safeManagementAbi,
  testamentRegistryAbi,
} from "@testament/shared";
import hre from "hardhat";
import { formatEther, getAddress, type Address } from "viem";

import { describeMandateFailure, ensureSpendableMandate } from "../lib/mandate.ts";

/**
 * Seals one long-lived demo testament on Ethereum Sepolia and stops there.
 *
 * The e2e rehearsal runs the whole life cycle and leaves the registry with an executed
 * will; this script leaves it with a living one, so the closed door, the countdown, and
 * the heartbeat all have something real to show. The interval is deliberately long: the
 * testament stays closed through judging unless the owner goes silent on purpose.
 *
 * Run with: bun run write-demo:sepolia
 */

/** Long enough to stay closed while people look at it. Unit: seconds. */
const DEMO_INTERVAL_SECONDS = 40 * 24 * 60 * 60;
const DEMO_GRACE_SECONDS = 5 * 24 * 60 * 60;

/** The rehearsal shares, unchanged: two heirs at 60/40. Unit: bps. */
const SHARE_A_BPS = 6000;
const SHARE_B_BPS = 4000;

/** Below this the Safe is topped up before the write. Unit: wei. */
const MINIMUM_ESTATE_WEI = 5_000_000_000_000_000n; // 0.005 ETH

/** What the Safe is topped up to. Unit: wei. */
const TOP_UP_ESTATE_WEI = 20_000_000_000_000_000n; // 0.02 ETH

function requireEnv(variableName: string): string {
  const raw = process.env[variableName];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`[writeDemo] ${variableName} is not set in packages/contracts/.env`);
  }
  return raw.trim();
}

function requireEnvAddress(variableName: string): Address {
  return getAddress(requireEnv(variableName));
}

const registryAddress = requireEnvAddress("REGISTRY_ADDRESS");
const moduleAddress = requireEnvAddress("MODULE_ADDRESS");
const safeAddress = requireEnvAddress("SAFE_ADDRESS");
const beneficiaryA = requireEnvAddress("BENEFICIARY_A");
const beneficiaryB = requireEnvAddress("BENEFICIARY_B");

const connection = await hre.network.getOrCreate();
const { viem, networkName } = connection;

const publicClient = await viem.getPublicClient();
const [ownerWallet] = await viem.getWalletClients();
if (ownerWallet === undefined) {
  throw new Error("[writeDemo] no wallet configured, check DEPLOYER_PRIVATE_KEY");
}
const ownerAddress = ownerWallet.account.address;

console.log(`[writeDemo] network  ${networkName}`);
console.log(`[writeDemo] owner    ${ownerAddress}`);

const deployerBalanceWei = await publicClient.getBalance({ address: ownerAddress });
console.log(`[writeDemo] deployer ${formatEther(deployerBalanceWei)} ETH`);

const moduleEnabled = await publicClient.readContract({
  address: safeAddress,
  abi: safeManagementAbi,
  functionName: "isModuleEnabled",
  args: [moduleAddress],
});
if (!moduleEnabled) {
  throw new Error(`[writeDemo] the Safe has not enabled ${moduleAddress}`);
}

// A mandate buys one will, and the previous demo spent the current one. Asking the Safe for
// another before anything else means a failed grant costs no top-up and no revoke.
const mandate = await ensureSpendableMandate({
  reader: publicClient,
  granter: ownerWallet,
  safeAddress,
  moduleAddress,
  registryAddress,
  writerAddress: ownerAddress,
  onGrant: (currentNonce) =>
    console.log(`[writeDemo] mandate ${currentNonce} already spent, asking the Safe for a new one`),
});
if (!mandate.ok) {
  throw new Error(`[writeDemo] ${describeMandateFailure(mandate.failure)}`);
}
if (mandate.transactionHash !== null) {
  console.log(`[writeDemo] authorize ${mandate.transactionHash}`);
}
console.log(`[writeDemo] mandate  nonce ${mandate.nonce}`);

let estateValueWei = await publicClient.getBalance({ address: safeAddress });
if (estateValueWei < MINIMUM_ESTATE_WEI) {
  console.log(`[writeDemo] refilling the Safe to ${formatEther(TOP_UP_ESTATE_WEI)} ETH`);
  const topUpHash = await ownerWallet.sendTransaction({
    to: safeAddress,
    value: TOP_UP_ESTATE_WEI - estateValueWei,
  });
  await publicClient.waitForTransactionReceipt({ hash: topUpHash });
  estateValueWei = await publicClient.getBalance({ address: safeAddress });
}
console.log(`[writeDemo] estate   ${formatEther(estateValueWei)} ETH`);

const existingId = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "activeTestamentOf",
  args: [ownerAddress],
});
if (existingId !== 0n) {
  console.log(`[writeDemo] revoking leftover testament #${existingId}`);
  const revokeHash = await ownerWallet.writeContract({
    address: registryAddress,
    abi: testamentRegistryAbi,
    functionName: "revoke",
    args: [existingId],
  });
  await publicClient.waitForTransactionReceipt({ hash: revokeHash });
}

const packed = packBequests([
  { beneficiary: beneficiaryA, shareBps: SHARE_A_BPS },
  { beneficiary: beneficiaryB, shareBps: SHARE_B_BPS },
]);
if (!packed.ok) {
  throw new Error(`[writeDemo] ${describePackFailure(packed.failure)}`);
}

const handleClient = await createViemHandleClient(ownerWallet);

console.log(`[writeDemo] encrypting ${SLOT_COUNT} slots through the Handle Gateway`);
const encrypted = await encryptTestamentSlots(packed.slots, (slotValue) =>
  handleClient.encryptInput(slotValue, "uint256", registryAddress),
);
if (!encrypted.ok) {
  throw new Error(`[writeDemo] slot ${encrypted.failure.slotIndex}: ${encrypted.failure.message}`);
}

const writeHash = await ownerWallet.writeContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "write",
  args: [
    safeAddress,
    DEMO_INTERVAL_SECONDS,
    DEMO_GRACE_SECONDS,
    encrypted.encryptions.handles,
    encrypted.encryptions.proofs,
  ],
});
const writeReceipt = await publicClient.waitForTransactionReceipt({ hash: writeHash });
if (writeReceipt.status !== "success") {
  throw new Error(`[writeDemo] write reverted: ${writeHash}`);
}

const testamentId = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "activeTestamentOf",
  args: [ownerAddress],
});

console.log(`[writeDemo] sealed testament #${testamentId} in ${writeHash}`);
console.log(`[writeDemo] door link: /porte?id=${testamentId}`);
