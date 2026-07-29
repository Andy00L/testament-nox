import { resolve } from "node:path";

import hre from "hardhat";
import { formatEther } from "viem";

import { deployTestamentSystem } from "../lib/deployment.ts";
import { updateEnvFile } from "../lib/env-file.ts";

/**
 * Deploys TestamentModule and TestamentRegistry, then writes the two addresses back into
 * packages/contracts/.env so the keeper, the web app, and the e2e script pick them up.
 *
 * Run with: bun run deploy:sepolia
 */

/** Below this the deployer cannot cover a deploy plus a few Nox-heavy transactions. Unit: wei. */
const MINIMUM_DEPLOYER_BALANCE_WEI = 20_000_000_000_000_000n; // 0.02 ETH

const ENV_FILE_PATH = resolve(import.meta.dirname, "../.env");

const connection = await hre.network.getOrCreate();
const { viem, networkName } = connection;

const publicClient = await viem.getPublicClient();
const [deployerWallet] = await viem.getWalletClients();
if (deployerWallet === undefined) {
  throw new Error("[deploy] no wallet configured, check DEPLOYER_PRIVATE_KEY");
}

const deployerAddress = deployerWallet.account.address;
const deployerBalance = await publicClient.getBalance({ address: deployerAddress });

console.log(`[deploy] network  ${networkName}`);
console.log(`[deploy] deployer ${deployerAddress}`);
console.log(`[deploy] balance  ${formatEther(deployerBalance)} ETH`);

if (deployerBalance < MINIMUM_DEPLOYER_BALANCE_WEI) {
  throw new Error(
    `[deploy] deployer holds ${formatEther(deployerBalance)} ETH, needs at least ${formatEther(MINIMUM_DEPLOYER_BALANCE_WEI)} ETH`,
  );
}

const result = await deployTestamentSystem(viem, publicClient, deployerAddress);
if (!result.ok) {
  throw new Error(
    `[deploy] ${result.failure.reason}: predicted ${result.failure.predicted}, deployed ${result.failure.actual}. Nothing was wired, redeploy.`,
  );
}

const { moduleAddress, registryAddress } = result.deployment;

console.log(`[deploy] TestamentModule   ${moduleAddress}`);
console.log(`[deploy] TestamentRegistry ${registryAddress}`);

updateEnvFile(ENV_FILE_PATH, {
  MODULE_ADDRESS: moduleAddress,
  REGISTRY_ADDRESS: registryAddress,
});
console.log(`[deploy] wrote MODULE_ADDRESS and REGISTRY_ADDRESS to ${ENV_FILE_PATH}`);

console.log("[deploy] verify with:");
console.log(`  bunx hardhat verify --network ${networkName} ${moduleAddress} ${registryAddress}`);
console.log(`  bunx hardhat verify --network ${networkName} ${registryAddress} ${moduleAddress}`);

await connection.close();
