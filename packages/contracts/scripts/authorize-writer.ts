import {
  buildAuthorizeWriterTransaction,
  safeManagementAbi,
  testamentModuleAbi,
} from "@testament/shared";
import hre from "hardhat";
import { getAddress, type Address } from "viem";

/**
 * Names the deployer as the one writer allowed to draw a will on the Safe at SAFE_ADDRESS.
 *
 * Enabling a Safe module hands it unrestricted spending authority, so TestamentModule asks
 * for a second, narrower consent: the Safe has to name its writer. That naming can only come
 * from the Safe itself, which means an `execTransaction` that cleared the Safe's threshold.
 * A 1-of-1 Safe whose owner submits the transaction needs no off-chain signing, so this is
 * one transaction from the deployer key.
 *
 * Run after enable-module:sepolia, with: bun run authorize-writer:sepolia
 */

function requireEnvAddress(variableName: string): Address {
  const raw = process.env[variableName];
  if (raw === undefined || raw.trim() === "") {
    throw new Error(`[authorizeWriter] ${variableName} is not set in packages/contracts/.env`);
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
  throw new Error("[authorizeWriter] no wallet configured, check DEPLOYER_PRIVATE_KEY");
}
const ownerAddress = ownerWallet.account.address;

console.log(`[authorizeWriter] network ${networkName}`);
console.log(`[authorizeWriter] safe    ${safeAddress}`);
console.log(`[authorizeWriter] module  ${moduleAddress}`);
console.log(`[authorizeWriter] writer  ${ownerAddress}`);

const moduleEnabled = await publicClient.readContract({
  address: safeAddress,
  abi: safeManagementAbi,
  functionName: "isModuleEnabled",
  args: [moduleAddress],
});
if (!moduleEnabled) {
  throw new Error(
    `[authorizeWriter] the Safe has not enabled ${moduleAddress}. Run: bun run enable-module:sepolia`,
  );
}

const [currentWriter, currentNonce] = await publicClient.readContract({
  address: moduleAddress,
  abi: testamentModuleAbi,
  functionName: "authorizationOf",
  args: [safeAddress],
});
if (currentWriter.toLowerCase() === ownerAddress.toLowerCase()) {
  console.log(`[authorizeWriter] already authorized at nonce ${currentNonce}, nothing to do`);
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

const isOwner = safeOwners.some((owner) => owner.toLowerCase() === ownerAddress.toLowerCase());
if (!isOwner) {
  throw new Error(
    `[authorizeWriter] ${ownerAddress} is not an owner of ${safeAddress}. Owners: ${safeOwners.join(", ")}`,
  );
}

if (threshold !== 1n) {
  throw new Error(
    `[authorizeWriter] this script only handles a 1-of-1 Safe, threshold is ${threshold}. Use the Safe Transaction Builder at app.safe.global instead, calling authorizeWriter(${ownerAddress}) on ${moduleAddress}.`,
  );
}

// Rotating the mandate invalidates any will written under the previous one, so say so before
// doing it rather than letting a testament quietly stop being payable.
if (currentWriter !== "0x0000000000000000000000000000000000000000") {
  console.log(
    `[authorizeWriter] replacing ${currentWriter}. Any testament written under nonce ${currentNonce} can no longer pay out.`,
  );
}

const authorizeTransaction = buildAuthorizeWriterTransaction(
  safeAddress,
  moduleAddress,
  ownerAddress,
  ownerAddress,
);
const transactionHash = await ownerWallet.writeContract(authorizeTransaction);
console.log(`[authorizeWriter] tx ${transactionHash}`);

const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
if (receipt.status !== "success") {
  throw new Error(`[authorizeWriter] transaction reverted, hash ${transactionHash}`);
}

const [writerNow, nonceNow] = await publicClient.readContract({
  address: moduleAddress,
  abi: testamentModuleAbi,
  functionName: "authorizationOf",
  args: [safeAddress],
});
if (writerNow.toLowerCase() !== ownerAddress.toLowerCase()) {
  throw new Error(
    `[authorizeWriter] transaction landed but the mandate reads ${writerNow}. Safe transactions swallow inner reverts, so check the trace.`,
  );
}

console.log(`[authorizeWriter] writer authorized at nonce ${nonceNow}`);

await connection.close();
