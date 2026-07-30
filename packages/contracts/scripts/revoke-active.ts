import { testamentRegistryAbi } from "@testament/shared";
import hre from "hardhat";
import { getAddress, type Address } from "viem";

/**
 * Revokes the owner's active testament, if there is one.
 *
 * The registry allows one active testament per owner, so the demo video's on-camera
 * write needs the slot free. Run this right before recording; afterwards
 * `bun run write-demo:sepolia` restores a long-lived one for judges.
 *
 * Run with: bun run revoke:sepolia
 */

function requireEnvAddress(variableName: string): Address {
  const raw = process.env[variableName];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`[revokeActive] ${variableName} is not set in packages/contracts/.env`);
  }
  return getAddress(raw.trim());
}

const registryAddress = requireEnvAddress("REGISTRY_ADDRESS");

const connection = await hre.network.getOrCreate();
const { viem, networkName } = connection;

const publicClient = await viem.getPublicClient();
const [ownerWallet] = await viem.getWalletClients();
if (ownerWallet === undefined) {
  throw new Error("[revokeActive] no wallet configured, check DEPLOYER_PRIVATE_KEY");
}
const ownerAddress = ownerWallet.account.address;

console.log(`[revokeActive] network ${networkName}`);
console.log(`[revokeActive] owner   ${ownerAddress}`);

const activeId = await publicClient.readContract({
  address: registryAddress,
  abi: testamentRegistryAbi,
  functionName: "activeTestamentOf",
  args: [ownerAddress],
});

if (activeId === 0n) {
  console.log("[revokeActive] no active testament, nothing to revoke");
} else {
  const revokeHash = await ownerWallet.writeContract({
    address: registryAddress,
    abi: testamentRegistryAbi,
    functionName: "revoke",
    args: [activeId],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: revokeHash });
  if (receipt.status !== "success") {
    throw new Error(`[revokeActive] revoke reverted: ${revokeHash}`);
  }
  console.log(`[revokeActive] revoked testament #${activeId} in ${revokeHash}`);
}
