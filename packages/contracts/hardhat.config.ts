import "dotenv/config";

import noxPlugin from "@iexec-nox/nox-hardhat-plugin";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { configVariable, defineConfig } from "hardhat/config";

/**
 * Chain id of Ethereum Sepolia, the only public network Testament targets.
 * sourceRef: @iexec-nox/nox-protocol-contracts contracts/sdk/Nox.sol, noxComputeContract()
 * maps 11155111 to NoxCompute at 0x24Ef36Ec5b626D7DCD09a98F3083c2758F0F77bF.
 */
const SEPOLIA_CHAIN_ID = 11155111;

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin, noxPlugin],
  solidity: {
    version: "0.8.35",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    // The Nox plugin etches NoxCompute into the simulated chain and boots the offchain
    // stack in Docker. `chainType: "op"` is required by the plugin.
    default: {
      type: "edr-simulated",
      chainType: "op",
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      chainId: SEPOLIA_CHAIN_ID,
      url: configVariable("SEPOLIA_RPC_URL"),
      accounts: [configVariable("DEPLOYER_PRIVATE_KEY")],
    },
  },
  verify: {
    etherscan: {
      apiKey: configVariable("ETHERSCAN_API_KEY"),
    },
  },
});
