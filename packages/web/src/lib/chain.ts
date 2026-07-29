import { createConfig, http } from "wagmi";
import { sepolia } from "wagmi/chains";
import { injected, walletConnect } from "wagmi/connectors";
import { isAddress, type Address } from "viem";

/**
 * Chain wiring. Ethereum Sepolia only: Nox deploys NoxCompute there, so there is nowhere
 * else this product can run.
 *
 * The wallet list is deliberately short and rendered by this project's own control rather
 * than a connector kit's modal. A borrowed modal would be the loudest thing on a page whose
 * whole point is that it looks like nothing else.
 */

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim();

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [
    injected(),
    // WalletConnect is optional: without a project id the app still works with an
    // injected wallet, so a missing key degrades one connector rather than the product.
    ...(walletConnectProjectId !== undefined && walletConnectProjectId !== ""
      ? [walletConnect({ projectId: walletConnectProjectId, showQrModal: true })]
      : []),
  ],
  transports: {
    [sepolia.id]: http(process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL),
  },
  ssr: true,
});

export const TESTAMENT_CHAIN = sepolia;

export type DeployedAddresses = {
  registry: Address;
  module: Address;
};

export type DeploymentStatus =
  | { isDeployed: true; addresses: DeployedAddresses }
  | { isDeployed: false; missing: string[] };

/**
 * The contract addresses, read as a value rather than thrown, so a checkout without a
 * deployment renders an honest "not deployed yet" state instead of a blank screen.
 *
 * Computed once at module scope: NEXT_PUBLIC_ values are inlined at build time, so the
 * result can never change while the app runs. Returning a fresh object per call put an
 * unstable identity into hook dependency arrays, and in HeartbeatControl that re-armed the
 * hold effect on every progress frame, resetting the hold clock: the heartbeat could never
 * actually be sent. A constant makes that class of bug impossible.
 */
export function readDeployment(): DeploymentStatus {
  return DEPLOYMENT;
}

function computeDeployment(): DeploymentStatus {
  // Not named `module`: the bundler treats that identifier specially in this scope.
  const registryAddress = process.env.NEXT_PUBLIC_REGISTRY_ADDRESS?.trim();
  const moduleAddress = process.env.NEXT_PUBLIC_MODULE_ADDRESS?.trim();

  const missing: string[] = [];
  if (registryAddress === undefined || !isAddress(registryAddress)) {
    missing.push("NEXT_PUBLIC_REGISTRY_ADDRESS");
  }
  if (moduleAddress === undefined || !isAddress(moduleAddress)) {
    missing.push("NEXT_PUBLIC_MODULE_ADDRESS");
  }

  if (missing.length > 0 || registryAddress === undefined || moduleAddress === undefined) {
    return { isDeployed: false, missing };
  }

  return {
    isDeployed: true,
    addresses: { registry: registryAddress as Address, module: moduleAddress as Address },
  };
}

const DEPLOYMENT: DeploymentStatus = computeDeployment();

/** Etherscan link for a transaction, so every claim in the UI is checkable. */
export function buildTransactionUrl(transactionHash: string): string {
  return `${TESTAMENT_CHAIN.blockExplorers.default.url}/tx/${transactionHash}`;
}

/** Etherscan link for an address. */
export function buildAddressUrl(address: string): string {
  return `${TESTAMENT_CHAIN.blockExplorers.default.url}/address/${address}`;
}

/** `0x1234…cdef`, for anywhere a full address would break the line. */
export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
