import { getContractAddress, type Address } from "viem";

/**
 * TestamentModule and TestamentRegistry each hold an immutable reference to the other, so
 * neither can be repointed once a Safe has enabled the module. That means the module has
 * to be told the registry address before the registry exists.
 *
 * Rather than adding a one-shot setter (and with it an owner, and a window where the pair
 * is half-wired), the registry address is derived from the deployer's next nonce, the
 * module is deployed against it, and the prediction is checked before anything is used.
 * A wrong prediction fails here instead of producing a bricked module.
 */

/** Minimal shape of the hardhat-viem deployment helper this module needs. */
type ContractDeployer = {
  deployContract(contractName: string, constructorArgs: unknown[]): Promise<{ address: Address }>;
};

/** Minimal shape of the viem public client this module needs. */
type NonceReader = {
  getTransactionCount(parameters: { address: Address }): Promise<number>;
};

export type TestamentDeployment = {
  moduleAddress: Address;
  registryAddress: Address;
};

export type DeploymentFailure = {
  reason: "registry-address-mismatch";
  predicted: Address;
  actual: Address;
};

export type DeployTestamentSystemResult =
  | { ok: true; deployment: TestamentDeployment }
  | { ok: false; failure: DeploymentFailure };

export async function deployTestamentSystem(
  deployer: ContractDeployer,
  nonceReader: NonceReader,
  deployerAddress: Address,
): Promise<DeployTestamentSystemResult> {
  const nextNonce = await nonceReader.getTransactionCount({ address: deployerAddress });

  // The module is deployed at `nextNonce`, so the registry lands at `nextNonce + 1`.
  const predictedRegistryAddress = getContractAddress({
    from: deployerAddress,
    nonce: BigInt(nextNonce + 1),
  });

  const module = await deployer.deployContract("TestamentModule", [predictedRegistryAddress]);
  const registry = await deployer.deployContract("TestamentRegistry", [module.address]);

  if (registry.address.toLowerCase() !== predictedRegistryAddress.toLowerCase()) {
    return {
      ok: false,
      failure: {
        reason: "registry-address-mismatch",
        predicted: predictedRegistryAddress,
        actual: registry.address,
      },
    };
  }

  return {
    ok: true,
    deployment: { moduleAddress: module.address, registryAddress: registry.address },
  };
}
