import { buildEnableModuleTransaction, safeManagementAbi } from "@testament/shared";
import hre from "hardhat";
import { getAddress, type Address } from "viem";

/**
 * Enables TestamentModule on the Safe named by SAFE_ADDRESS.
 *
 * A 1-of-1 Safe whose owner sends the transaction itself needs no off-chain signing: Safe
 * accepts a pre-validated signature when `msg.sender` is the approving owner. So this is a
 * single transaction from the deployer key, not a Safe SDK dance.
 *
 * Run with: bun run enable-module:sepolia
 */

function requireEnvAddress(variableName: string): Address {
  const raw = process.env[variableName];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`[enableModule] ${variableName} is not set in packages/contracts/.env`);
  }
  return getAddress(raw.trim());
}

const safeAddress = requireEnvAddress("SAFE_ADDRESS");
const moduleAddress = requireEnvAddress("MODULE_ADDRESS");

const connection = await hre.network.getOrCreate();
const { viem, networkName } = connection;

const publicClient = await viem.getPublicClient();
const [ownerWallet] = await viem.getWalletClients();
if (ownerWallet === undefined) {
  throw new Error("[enableModule] no wallet configured, check DEPLOYER_PRIVATE_KEY");
}
const ownerAddress = ownerWallet.account.address;

console.log(`[enableModule] network ${networkName}`);
console.log(`[enableModule] safe    ${safeAddress}`);
console.log(`[enableModule] module  ${moduleAddress}`);
console.log(`[enableModule] owner   ${ownerAddress}`);

const alreadyEnabled = await publicClient.readContract({
  address: safeAddress,
  abi: safeManagementAbi,
  functionName: "isModuleEnabled",
  args: [moduleAddress],
});
if (alreadyEnabled) {
  console.log("[enableModule] already enabled, nothing to do");
  await connection.close();
  process.exit(0);
}

const [safeOwners, threshold] = await Promise.all([
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

const isOwner = safeOwners.some(
  (owner) => owner.toLowerCase() === ownerAddress.toLowerCase(),
);
if (!isOwner) {
  throw new Error(
    `[enableModule] ${ownerAddress} is not an owner of ${safeAddress}. Owners: ${safeOwners.join(", ")}`,
  );
}

if (threshold !== 1n) {
  throw new Error(
    `[enableModule] this script only handles a 1-of-1 Safe, threshold is ${threshold}. Use the Safe Transaction Builder at app.safe.global instead, calling enableModule(${moduleAddress}) on the Safe itself.`,
  );
}

const enableTransaction = buildEnableModuleTransaction(safeAddress, moduleAddress, ownerAddress);
const transactionHash = await ownerWallet.writeContract(enableTransaction);
console.log(`[enableModule] tx ${transactionHash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
if (receipt.status !== "success") {
  throw new Error(`[enableModule] transaction reverted, hash ${transactionHash}`);
}

const enabledNow = await publicClient.readContract({
  address: safeAddress,
  abi: safeManagementAbi,
  functionName: "isModuleEnabled",
  args: [moduleAddress],
});
if (!enabledNow) {
  throw new Error("[enableModule] transaction landed but the module is still not enabled");
}

console.log("[enableModule] module enabled");

await connection.close();
