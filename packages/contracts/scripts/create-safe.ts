import { resolve } from "node:path";

import hre from "hardhat";
import { encodeFunctionData, formatEther, parseEther, zeroAddress, type Address } from "viem";

import { updateEnvFile } from "../lib/env-file.ts";

/**
 * Deploys a 1-of-1 Safe owned by the deployer and funds it, so a fresh checkout can reach a
 * working end-to-end demo without anyone clicking through app.safe.global.
 *
 * Uses the canonical Safe v1.4.1 deployments already on Sepolia: this creates a proxy of the
 * audited singleton, it does not deploy any Safe code of its own.
 *
 * Run with: bun run create-safe:sepolia
 */

/**
 * Canonical Safe v1.4.1 addresses. Identical across every chain Safe has deployed to, and
 * checked for code before use so a wrong chain fails loudly instead of silently.
 * sourceRef: safe-global/safe-deployments, v1.4.1 canonical entries.
 */
const SAFE_PROXY_FACTORY: Address = "0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67";
const SAFE_SINGLETON: Address = "0x41675C099F32341bf84BFc5382aF534df5C7461a";
const SAFE_FALLBACK_HANDLER: Address = "0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99";

/** The estate the demo Safe is funded with. Unit: wei. */
const ESTATE_WEI = parseEther("0.02");

const ENV_FILE_PATH = resolve(import.meta.dirname, "../.env");

/**
 * sourceRef: safe-smart-account v1.4.1 contracts/Safe.sol setup(),
 * contracts/proxies/SafeProxyFactory.sol createProxyWithNonce() and the ProxyCreation event.
 */
const safeSetupAbi = [
  {
    inputs: [
      { name: "_owners", type: "address[]" },
      { name: "_threshold", type: "uint256" },
      { name: "to", type: "address" },
      { name: "data", type: "bytes" },
      { name: "fallbackHandler", type: "address" },
      { name: "paymentToken", type: "address" },
      { name: "payment", type: "uint256" },
      { name: "paymentReceiver", type: "address" },
    ],
    name: "setup",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

const safeProxyFactoryAbi = [
  {
    inputs: [
      { name: "_singleton", type: "address" },
      { name: "initializer", type: "bytes" },
      { name: "saltNonce", type: "uint256" },
    ],
    name: "createProxyWithNonce",
    outputs: [{ name: "proxy", type: "address" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "proxy", type: "address" },
      { indexed: false, name: "singleton", type: "address" },
    ],
    name: "ProxyCreation",
    type: "event",
  },
] as const;

const connection = await hre.network.getOrCreate();
const { viem, networkName } = connection;

const publicClient = await viem.getPublicClient();
const [ownerWallet] = await viem.getWalletClients();
if (ownerWallet === undefined) {
  throw new Error("[createSafe] no wallet configured, check DEPLOYER_PRIVATE_KEY");
}
const ownerAddress = ownerWallet.account.address;

console.log(`[createSafe] network ${networkName}`);
console.log(`[createSafe] owner   ${ownerAddress}`);

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

const setupCalldata = encodeFunctionData({
  abi: safeSetupAbi,
  functionName: "setup",
  args: [
    [ownerAddress],
    1n,
    zeroAddress,
    "0x",
    SAFE_FALLBACK_HANDLER,
    zeroAddress,
    0n,
    zeroAddress,
  ],
});

// The salt is the deployer's current nonce, so re-running produces a new Safe rather than
// colliding with the previous one.
const saltNonce = BigInt(await publicClient.getTransactionCount({ address: ownerAddress }));

const createHash = await ownerWallet.writeContract({
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
  event: safeProxyFactoryAbi[1],
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

const fundingHash = await ownerWallet.sendTransaction({ to: safeAddress, value: ESTATE_WEI });
await publicClient.waitForTransactionReceipt({ hash: fundingHash });

const estate = await publicClient.getBalance({ address: safeAddress });
console.log(`[createSafe] estate  ${formatEther(estate)} ETH`);

updateEnvFile(ENV_FILE_PATH, { SAFE_ADDRESS: safeAddress });
console.log(`[createSafe] wrote SAFE_ADDRESS to ${ENV_FILE_PATH}`);
console.log("[createSafe] next: bun run enable-module:sepolia");

await connection.close();
