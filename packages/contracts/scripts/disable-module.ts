import {
  SAFE_SENTINEL_MODULES,
  buildDisableModuleTransaction,
  safeManagementAbi,
} from "@testament/shared";
import hre from "hardhat";
import { getAddress, type Address } from "viem";

/**
 * Turns a module off on the Safe at SAFE_ADDRESS.
 *
 * Written for one specific job: retiring a superseded TestamentModule. An enabled module
 * keeps unrestricted spending authority over the Safe forever, so leaving an old one enabled
 * after deploying its replacement leaves the old, weaker authorization path live against the
 * same estate. Deploying a fix does not remove the thing it fixed.
 *
 * Safe stores modules as a linked list, so removal needs the entry pointing at the target.
 * This reads the list and works that pointer out rather than asking for it.
 *
 * Run with: DISABLE_MODULE_ADDRESS=0x... bun run disable-module:sepolia
 */

/** Modules read per page. The demo Safe has at most a handful. */
const MODULE_PAGE_SIZE = 20n;

function requireEnvAddress(variableName: string): Address {
  const raw = process.env[variableName];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`[disableModule] ${variableName} is not set`);
  }
  return getAddress(raw.trim());
}

const safeAddress = requireEnvAddress("SAFE_ADDRESS");
const targetModule = requireEnvAddress("DISABLE_MODULE_ADDRESS");

const connection = await hre.network.getOrCreate();
const { viem, networkName } = connection;

const publicClient = await viem.getPublicClient();
const [ownerWallet] = await viem.getWalletClients();
if (ownerWallet === undefined) {
  throw new Error("[disableModule] no wallet configured, check DEPLOYER_PRIVATE_KEY");
}
const ownerAddress = ownerWallet.account.address;

console.log(`[disableModule] network ${networkName}`);
console.log(`[disableModule] safe    ${safeAddress}`);
console.log(`[disableModule] module  ${targetModule}`);

const isEnabled = await publicClient.readContract({
  address: safeAddress,
  abi: safeManagementAbi,
  functionName: "isModuleEnabled",
  args: [targetModule],
});
if (!isEnabled) {
  console.log("[disableModule] not enabled, nothing to do");
  await connection.close();
  process.exit(0);
}

const [enabledModules] = await publicClient.readContract({
  address: safeAddress,
  abi: safeManagementAbi,
  functionName: "getModulesPaginated",
  args: [SAFE_SENTINEL_MODULES, MODULE_PAGE_SIZE],
});
console.log(`[disableModule] enabled modules: ${enabledModules.join(", ")}`);

const targetIndex = enabledModules.findIndex(
  (moduleAddress) => moduleAddress.toLowerCase() === targetModule.toLowerCase(),
);
if (targetIndex === -1) {
  throw new Error(
    `[disableModule] ${targetModule} reads as enabled but is not in the first ${MODULE_PAGE_SIZE} entries. Raise MODULE_PAGE_SIZE.`,
  );
}

// The list runs newest first from the sentinel, so the pointer at the target is whatever
// precedes it, and the sentinel itself when the target is at the head.
const previousModule = targetIndex === 0 ? SAFE_SENTINEL_MODULES : enabledModules[targetIndex - 1];
if (previousModule === undefined) {
  throw new Error("[disableModule] could not resolve the preceding module");
}
console.log(`[disableModule] prev    ${previousModule}`);

const transaction = buildDisableModuleTransaction(
  safeAddress,
  previousModule,
  targetModule,
  ownerAddress,
);
const transactionHash = await ownerWallet.writeContract(transaction);
console.log(`[disableModule] tx ${transactionHash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
if (receipt.status !== "success") {
  throw new Error(`[disableModule] transaction reverted, hash ${transactionHash}`);
}

const stillEnabled = await publicClient.readContract({
  address: safeAddress,
  abi: safeManagementAbi,
  functionName: "isModuleEnabled",
  args: [targetModule],
});
if (stillEnabled) {
  throw new Error(
    "[disableModule] transaction landed but the module is still enabled. Safe transactions swallow inner reverts, so check the trace.",
  );
}

console.log("[disableModule] module disabled");

await connection.close();
