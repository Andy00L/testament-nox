import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nox } from "@iexec-nox/nox-hardhat-plugin";
import { parseEther, zeroAddress } from "viem";

/**
 * TestamentModule holds no encrypted state, so these tests deploy it with an EOA standing
 * in for the registry. That EOA is the only address allowed to move funds, which is the
 * property the whole payout path rests on.
 */
async function deployModuleFixture() {
  const { viem } = await nox.connect();
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();

  const [registryWallet, outsiderWallet, beneficiaryWallet] = walletClients;
  if (registryWallet === undefined || outsiderWallet === undefined || beneficiaryWallet === undefined) {
    throw new Error("[deployModuleFixture] expected at least three wallet clients");
  }

  // The registry slot is filled by an EOA so the test can call distribute directly.
  const module = await viem.deployContract("TestamentModule", [registryWallet.account.address]);
  const safe = await viem.deployContract("MockSafe", []);

  const enableHash = await safe.write.enableModule([module.address]);
  await publicClient.waitForTransactionReceipt({ hash: enableHash });

  const fundingHash = await registryWallet.sendTransaction({
    to: safe.address,
    value: parseEther("1"),
  });
  await publicClient.waitForTransactionReceipt({ hash: fundingHash });

  return {
    viem,
    publicClient,
    module,
    safe,
    registryWallet,
    outsiderWallet,
    beneficiaryWallet,
  };
}

describe("TestamentModule", () => {
  it("rejects a zero registry at construction", async () => {
    const { viem } = await nox.connect();
    await assert.rejects(viem.deployContract("TestamentModule", [zeroAddress]));
  });

  it("pins the registry address at construction", async () => {
    const { module, registryWallet } = await deployModuleFixture();
    const registry = (await module.read.registry()) as `0x${string}`;
    assert.equal(registry.toLowerCase(), registryWallet.account.address.toLowerCase());
  });

  it("refuses to distribute for anyone but the registry", async () => {
    const { module, safe, outsiderWallet, beneficiaryWallet } = await deployModuleFixture();

    await assert.rejects(
      module.write.distribute(
        [safe.address, [beneficiaryWallet.account.address], [parseEther("0.1")]],
        { account: outsiderWallet.account },
      ),
      "an outsider must not be able to drive the module",
    );
  });

  it("moves ETH out of the Safe for the registry", async () => {
    const { module, safe, publicClient, registryWallet, beneficiaryWallet } =
      await deployModuleFixture();

    const balanceBefore = await publicClient.getBalance({
      address: beneficiaryWallet.account.address,
    });

    const distributeHash = await module.write.distribute(
      [safe.address, [beneficiaryWallet.account.address], [parseEther("0.25")]],
      { account: registryWallet.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: distributeHash });

    const balanceAfter = await publicClient.getBalance({
      address: beneficiaryWallet.account.address,
    });
    assert.equal(balanceAfter - balanceBefore, parseEther("0.25"));
  });

  it("skips padded slots instead of reverting on them", async () => {
    const { module, safe, publicClient, registryWallet, beneficiaryWallet } =
      await deployModuleFixture();

    const safeBalanceBefore = await publicClient.getBalance({ address: safe.address });

    // Slot 0 is a real bequest, slot 1 is a zero-address pad, slot 2 is a zero-amount pad.
    const distributeHash = await module.write.distribute(
      [
        safe.address,
        [beneficiaryWallet.account.address, zeroAddress, beneficiaryWallet.account.address],
        [parseEther("0.1"), parseEther("0.5"), 0n],
      ],
      { account: registryWallet.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: distributeHash });

    const safeBalanceAfter = await publicClient.getBalance({ address: safe.address });
    assert.equal(safeBalanceBefore - safeBalanceAfter, parseEther("0.1"));
  });

  it("rejects index-misaligned recipients and amounts", async () => {
    const { module, safe, registryWallet, beneficiaryWallet } = await deployModuleFixture();

    await assert.rejects(
      module.write.distribute(
        [safe.address, [beneficiaryWallet.account.address], [parseEther("0.1"), parseEther("0.2")]],
        { account: registryWallet.account },
      ),
    );
  });

  it("keeps paying the other heirs when one of them refuses ETH", async () => {
    const { viem, module, safe, publicClient, registryWallet, beneficiaryWallet } =
      await deployModuleFixture();
    const rejectingReceiver = await viem.deployContract("RejectingReceiver", []);

    const balanceBefore = await publicClient.getBalance({
      address: beneficiaryWallet.account.address,
    });

    // A single heir that cannot accept ETH must not lock the whole estate: a testament gets
    // exactly one execution, so aborting the batch would strand everyone else's inheritance.
    const distributeHash = await module.write.distribute(
      [
        safe.address,
        [rejectingReceiver.address, beneficiaryWallet.account.address],
        [parseEther("0.3"), parseEther("0.2")],
      ],
      { account: registryWallet.account },
    );
    const receipt = await publicClient.waitForTransactionReceipt({ hash: distributeHash });
    assert.equal(receipt.status, "success");

    const balanceAfter = await publicClient.getBalance({
      address: beneficiaryWallet.account.address,
    });
    assert.equal(balanceAfter - balanceBefore, parseEther("0.2"));

    // The refusal is recorded rather than swallowed silently.
    const refusals = await publicClient.getLogs({
      address: module.address,
      event: {
        type: "event",
        name: "DistributionRefused",
        inputs: [
          { name: "safe", type: "address", indexed: true },
          { name: "recipient", type: "address", indexed: true },
          { name: "amount", type: "uint256", indexed: false },
        ],
      },
      fromBlock: receipt.blockNumber,
      toBlock: receipt.blockNumber,
    });
    assert.equal(refusals.length, 1);
  });

  it("refuses to spend a Safe that has not enabled it", async () => {
    const { viem, module, publicClient, registryWallet, beneficiaryWallet } =
      await deployModuleFixture();

    const strangerSafe = await viem.deployContract("MockSafe", []);
    const fundingHash = await registryWallet.sendTransaction({
      to: strangerSafe.address,
      value: parseEther("1"),
    });
    await publicClient.waitForTransactionReceipt({ hash: fundingHash });

    await assert.rejects(
      module.write.distribute(
        [strangerSafe.address, [beneficiaryWallet.account.address], [parseEther("0.1")]],
        { account: registryWallet.account },
      ),
    );
  });

  describe("isEnabledOn", () => {
    it("reports an enabled Safe", async () => {
      const { module, safe } = await deployModuleFixture();
      assert.equal(await module.read.isEnabledOn([safe.address]), true);
    });

    it("reports a Safe that has not enabled it", async () => {
      const { viem, module } = await deployModuleFixture();
      const strangerSafe = await viem.deployContract("MockSafe", []);
      assert.equal(await module.read.isEnabledOn([strangerSafe.address]), false);
    });

    it("returns false for an address that is not a Safe", async () => {
      const { module, beneficiaryWallet } = await deployModuleFixture();
      assert.equal(await module.read.isEnabledOn([beneficiaryWallet.account.address]), false);
    });
  });
});
