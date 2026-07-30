import { resolve } from "node:path";

import {
  SAFE_FALLBACK_HANDLER,
  SAFE_PROXY_CREATION_EVENT,
  SAFE_PROXY_FACTORY,
  SAFE_SINGLETON,
  encodeSafeSetup,
  safeManagementAbi,
  safeProxyFactoryAbi,
} from "@testament/shared";
import hre from "hardhat";
import { formatEther, getAddress, parseEther, type Address } from "viem";

import { updateEnvFile } from "../lib/env-file.ts";

/**
 * Deploys a 1-of-1 Safe and funds it, so a fresh checkout can reach a working end-to-end
 * demo without anyone clicking through app.safe.global.
 *
 * Uses the canonical Safe v1.4.1 deployments already on Sepolia: this creates a proxy of the
 * audited singleton, it does not deploy any Safe code of its own.
 *
 * The deployer owns the Safe by default. Set SAFE_OWNER_ADDRESS to hand ownership to another
 * wallet, for example the browser wallet used to follow the live test guide: Safe's setup()
 * decides ownership on its own, so the sender of the creation transaction only pays for it.
 *
 * Run with: bun run create-safe:sepolia
 */

/** The estate the demo Safe is funded with. Unit: wei. */
const ESTATE_WEI = parseEther("0.02");

const ENV_FILE_PATH = resolve(import.meta.dirname, "../.env");

/**
 * Reads the optional owner override. Every other env reader in scripts/ requires its value;
 * this one is absent in the normal path, so it returns undefined rather than throwing.
 * Throws only on a malformed address, because a typo here would deploy a Safe nobody owns.
 */
function readSafeOwnerOverride(): Address | undefined {
  const raw = process.env.SAFE_OWNER_ADDRESS;
  if (raw === undefined || raw.trim() === "") {
    return undefined;
  }
  return getAddress(raw.trim());
}

const connection = await hre.network.getOrCreate();
const { viem, networkName } = connection;

const publicClient = await viem.getPublicClient();
const [payerWallet] = await viem.getWalletClients();
if (payerWallet === undefined) {
  throw new Error("[createSafe] no wallet configured, check DEPLOYER_PRIVATE_KEY");
}
const payerAddress = payerWallet.account.address;
const ownerOverride = readSafeOwnerOverride();
const safeOwnerAddress = ownerOverride ?? payerAddress;

console.log(`[createSafe] network ${networkName}`);
console.log(`[createSafe] payer   ${payerAddress}`);
console.log(`[createSafe] owner   ${safeOwnerAddress}`);

// Fail loudly on the wrong chain rather than sending a transaction into nothing.
for (const [label, address] of [
  ["SafeProxyFactory", SAFE_PROXY_FACTORY],
  ["Safe singleton", SAFE_SINGLETON],
  ["FallbackHandler", SAFE_FALLBACK_HANDLER],
] as const) {
  const code = await publicClient.getCode({ address });
  if (code === undefined || code === "0x") {
    throw new Error(`[createSafe] no ${label} at ${address} on ${networkName}`);
  }
}

const setupCalldata = encodeSafeSetup(safeOwnerAddress);

// The salt is the payer's current nonce, so re-running produces a new Safe rather than
// colliding with the previous one. The test guide needs that: one Safe carries one will.
const saltNonce = BigInt(await publicClient.getTransactionCount({ address: payerAddress }));

const createHash = await payerWallet.writeContract({
  address: SAFE_PROXY_FACTORY,
  abi: safeProxyFactoryAbi,
  functionName: "createProxyWithNonce",
  args: [SAFE_SINGLETON, setupCalldata, saltNonce],
});
const createReceipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
if (createReceipt.status !== "success") {
  throw new Error(`[createSafe] proxy creation reverted, hash ${createHash}`);
}

const creationLogs = await publicClient.getLogs({
  address: SAFE_PROXY_FACTORY,
  event: SAFE_PROXY_CREATION_EVENT,
  fromBlock: createReceipt.blockNumber,
  toBlock: createReceipt.blockNumber,
});
const created = creationLogs.find((entry) => entry.transactionHash === createHash);
const safeAddress = created?.args.proxy;
if (safeAddress === undefined) {
  throw new Error(`[createSafe] no ProxyCreation event in ${createHash}`);
}

console.log(`[createSafe] safe    ${safeAddress}`);
console.log(`[createSafe] tx      ${createHash}`);

// Confirm from the chain who owns the Safe before the estate moves into it. The setup calldata
// is built here, so reading it back would only re-check this script's own input; a Safe whose
// owner is an address nobody holds the key to would swallow the funding transaction for good.
const [deployedOwners, deployedThreshold] = await Promise.all([
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
  deployedOwners.length === 1 &&
  deployedOwners[0]?.toLowerCase() === safeOwnerAddress.toLowerCase();
if (!hasExpectedSoleOwner || deployedThreshold !== 1n) {
  throw new Error(
    `[createSafe] ${safeAddress} came out as ${deployedThreshold} of [${deployedOwners.join(", ")}], ` +
      `expected 1 of [${safeOwnerAddress}]. Estate not sent.`,
  );
}

const fundingHash = await payerWallet.sendTransaction({ to: safeAddress, value: ESTATE_WEI });
await publicClient.waitForTransactionReceipt({ hash: fundingHash });

const estate = await publicClient.getBalance({ address: safeAddress });
console.log(`[createSafe] estate  ${formatEther(estate)} ETH`);

// SAFE_ADDRESS drives every other script here, and all of them sign as the deployer. Writing
// a Safe the deployer does not own would break them, so an overridden owner only gets the
// address printed: the module and the writer consent are granted from the app instead.
if (ownerOverride === undefined) {
  updateEnvFile(ENV_FILE_PATH, { SAFE_ADDRESS: safeAddress });
  console.log(`[createSafe] wrote SAFE_ADDRESS to ${ENV_FILE_PATH}`);
  console.log("[createSafe] next: bun run enable-module:sepolia");
} else {
  console.log("[createSafe] owner is not the deployer, .env left untouched");
  console.log(`[createSafe] next: paste ${safeAddress} into the app, then grant both consents`);
}

await connection.close();
