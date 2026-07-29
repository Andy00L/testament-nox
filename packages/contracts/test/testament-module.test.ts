import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nox } from "@iexec-nox/nox-hardhat-plugin";
import { testamentModuleAbi } from "@testament/shared";
import { encodeFunctionData, parseEther, zeroAddress, type Address, type Hex } from "viem";

/**
 * TestamentModule holds no encrypted state, so these tests deploy it with an EOA standing
 * in for the registry. That EOA is the only address allowed to move funds, and even it can
 * only move funds out of a Safe that granted the matching mandate. Those two checks are
 * what the whole payout path rests on.
 */
async function deployModuleFixture({ authorizeWriter = true }: { authorizeWriter?: boolean } = {}) {
  const { viem } = await nox.connect();
  const publicClient = await viem.getPublicClient();
  const walletClients = await viem.getWalletClients();

  const [registryWallet, outsiderWallet, beneficiaryWallet, writerWallet] = walletClients;
  if (
    registryWallet === undefined ||
    outsiderWallet === undefined ||
    beneficiaryWallet === undefined ||
    writerWallet === undefined
  ) {
    throw new Error("[deployModuleFixture] expected at least four wallet clients");
  }

  // The registry slot is filled by an EOA so the test can call distribute directly.
  const module = await viem.deployContract("TestamentModule", [registryWallet.account.address]);
  const safe = await viem.deployContract("MockSafe", []);

  const enableHash = await safe.write.enableModule([module.address]);
  await publicClient.waitForTransactionReceipt({ hash: enableHash });

  if (authorizeWriter) {
    const authorizeHash = await safe.write.executeAsSafe([
      module.address,
      encodeAuthorizeWriter(writerWallet.account.address),
    ]);
    await publicClient.waitForTransactionReceipt({ hash: authorizeHash });
  }

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
    writerWallet,
    /** The nonce the first authorization lands on. Every rotation adds one. */
    writerNonce: 1,
  };
}

/**
 * The calldata a Safe sends to grant a mandate. Kept as an encoder rather than a helper that
 * takes the contract, because hardhat-viem types a deployed contract's `write` as an index
 * signature that no hand-written parameter type matches.
 */
function encodeAuthorizeWriter(writerAddress: Address): Hex {
  return encodeFunctionData({
    abi: testamentModuleAbi,
    functionName: "authorizeWriter",
    args: [writerAddress],
  });
}

/** The calldata a Safe sends to withdraw its mandate. */
function encodeRevokeWriter(): Hex {
  return encodeFunctionData({ abi: testamentModuleAbi, functionName: "revokeWriter" });
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
    const { module, safe, outsiderWallet, beneficiaryWallet, writerWallet, writerNonce } =
      await deployModuleFixture();

    await assert.rejects(
      module.write.distribute(
        [
          safe.address,
          writerWallet.account.address,
          writerNonce,
          [beneficiaryWallet.account.address],
          [parseEther("0.1")],
        ],
        { account: outsiderWallet.account },
      ),
      "an outsider must not be able to drive the module",
    );
  });

  it("moves ETH out of the Safe for the registry", async () => {
    const { module, safe, publicClient, registryWallet, beneficiaryWallet, writerWallet, writerNonce } =
      await deployModuleFixture();

    const balanceBefore = await publicClient.getBalance({
      address: beneficiaryWallet.account.address,
    });

    const distributeHash = await module.write.distribute(
      [
        safe.address,
        writerWallet.account.address,
        writerNonce,
        [beneficiaryWallet.account.address],
        [parseEther("0.25")],
      ],
      { account: registryWallet.account },
    );
    await publicClient.waitForTransactionReceipt({ hash: distributeHash });

    const balanceAfter = await publicClient.getBalance({
      address: beneficiaryWallet.account.address,
    });
    assert.equal(balanceAfter - balanceBefore, parseEther("0.25"));
  });

  it("skips padded slots instead of reverting on them", async () => {
    const { module, safe, publicClient, registryWallet, beneficiaryWallet, writerWallet, writerNonce } =
      await deployModuleFixture();

    const safeBalanceBefore = await publicClient.getBalance({ address: safe.address });

    // Slot 0 is a real bequest, slot 1 is a zero-address pad, slot 2 is a zero-amount pad.
    const distributeHash = await module.write.distribute(
      [
        safe.address,
        writerWallet.account.address,
        writerNonce,
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
    const { module, safe, registryWallet, beneficiaryWallet, writerWallet, writerNonce } =
      await deployModuleFixture();

    await assert.rejects(
      module.write.distribute(
        [
          safe.address,
          writerWallet.account.address,
          writerNonce,
          [beneficiaryWallet.account.address],
          [parseEther("0.1"), parseEther("0.2")],
        ],
        { account: registryWallet.account },
      ),
    );
  });

  it("keeps paying the other heirs when one of them refuses ETH", async () => {
    const { viem, module, safe, publicClient, registryWallet, beneficiaryWallet, writerWallet, writerNonce } =
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
        writerWallet.account.address,
        writerNonce,
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

  it("fails loudly when a mandated Safe has since disabled the module", async () => {
    const { module, safe, publicClient, registryWallet, beneficiaryWallet, writerWallet, writerNonce } =
      await deployModuleFixture();

    const disableHash = await safe.write.disableModule([module.address]);
    await publicClient.waitForTransactionReceipt({ hash: disableHash });

    // Safe reverts with GS104 for a caller that is not an enabled module, and that must
    // abort the whole payout rather than being recorded as one heir refusing ETH.
    await assert.rejects(
      module.write.distribute(
        [
          safe.address,
          writerWallet.account.address,
          writerNonce,
          [beneficiaryWallet.account.address],
          [parseEther("0.1")],
        ],
        { account: registryWallet.account },
      ),
    );
  });

  describe("authorization", () => {
    it("refuses to spend a Safe that authorized nobody", async () => {
      const { viem, module, publicClient, registryWallet, beneficiaryWallet, writerWallet } =
        await deployModuleFixture();

      const strangerSafe = await viem.deployContract("MockSafe", []);
      const enableHash = await strangerSafe.write.enableModule([module.address]);
      await publicClient.waitForTransactionReceipt({ hash: enableHash });
      const fundingHash = await registryWallet.sendTransaction({
        to: strangerSafe.address,
        value: parseEther("1"),
      });
      await publicClient.waitForTransactionReceipt({ hash: fundingHash });

      // Enabling the module is not consent to any particular will. Without a mandate the
      // module refuses, even when the registry itself is the one asking.
      await assert.rejects(
        module.write.distribute(
          [
            strangerSafe.address,
            writerWallet.account.address,
            1,
            [beneficiaryWallet.account.address],
            [parseEther("0.1")],
          ],
          { account: registryWallet.account },
        ),
        /WriterNotAuthorized/,
      );

      assert.equal(
        await publicClient.getBalance({ address: strangerSafe.address }),
        parseEther("1"),
      );
    });

    it("refuses a writer the Safe did not name", async () => {
      const { module, safe, registryWallet, beneficiaryWallet, outsiderWallet, writerNonce } =
        await deployModuleFixture();

      await assert.rejects(
        module.write.distribute(
          [
            safe.address,
            outsiderWallet.account.address,
            writerNonce,
            [beneficiaryWallet.account.address],
            [parseEther("0.1")],
          ],
          { account: registryWallet.account },
        ),
        /WriterNotAuthorized/,
      );
    });

    it("refuses a mandate the Safe has withdrawn", async () => {
      const { module, safe, publicClient, registryWallet, beneficiaryWallet, writerWallet, writerNonce } =
        await deployModuleFixture();

      const revokeHash = await safe.write.executeAsSafe([module.address, encodeRevokeWriter()]);
      await publicClient.waitForTransactionReceipt({ hash: revokeHash });

      await assert.rejects(
        module.write.distribute(
          [
            safe.address,
            writerWallet.account.address,
            writerNonce,
            [beneficiaryWallet.account.address],
            [parseEther("0.1")],
          ],
          { account: registryWallet.account },
        ),
        /WriterNotAuthorized/,
      );
    });

    it("refuses a nonce the Safe has rotated past, even for the same writer", async () => {
      const { module, safe, publicClient, registryWallet, beneficiaryWallet, writerWallet, writerNonce } =
        await deployModuleFixture();

      // Re-authorizing the same address is still a new mandate. Anything written under the
      // old one is dead, which is what stops a stale will being replayed later.
      const reauthorizeHash = await safe.write.executeAsSafe([
        module.address,
        encodeAuthorizeWriter(writerWallet.account.address),
      ]);
      await publicClient.waitForTransactionReceipt({ hash: reauthorizeHash });

      await assert.rejects(
        module.write.distribute(
          [
            safe.address,
            writerWallet.account.address,
            writerNonce,
            [beneficiaryWallet.account.address],
            [parseEther("0.1")],
          ],
          { account: registryWallet.account },
        ),
        /AuthorizationRotated/,
      );

      // The current nonce still works, so rotation invalidates rather than bricks.
      const distributeHash = await module.write.distribute(
        [
          safe.address,
          writerWallet.account.address,
          writerNonce + 1,
          [beneficiaryWallet.account.address],
          [parseEther("0.1")],
        ],
        { account: registryWallet.account },
      );
      await publicClient.waitForTransactionReceipt({ hash: distributeHash });
    });

    it("does not let one Safe's mandate spend another Safe", async () => {
      const { viem, module, publicClient, registryWallet, beneficiaryWallet, writerWallet } =
        await deployModuleFixture();

      const otherSafe = await viem.deployContract("MockSafe", []);
      const enableHash = await otherSafe.write.enableModule([module.address]);
      await publicClient.waitForTransactionReceipt({ hash: enableHash });
      const fundingHash = await registryWallet.sendTransaction({
        to: otherSafe.address,
        value: parseEther("1"),
      });
      await publicClient.waitForTransactionReceipt({ hash: fundingHash });

      // The writer holds a real mandate, just not on this Safe. Mandates are per-Safe.
      await assert.rejects(
        module.write.distribute(
          [
            otherSafe.address,
            writerWallet.account.address,
            1,
            [beneficiaryWallet.account.address],
            [parseEther("0.1")],
          ],
          { account: registryWallet.account },
        ),
        /WriterNotAuthorized/,
      );
    });

    it("refuses a mandate on a Safe that has not enabled the module", async () => {
      const { viem, module, writerWallet } = await deployModuleFixture();

      const strangerSafe = await viem.deployContract("MockSafe", []);

      // executeAsSafe surfaces the inner revert, so this fails rather than silently
      // recording a mandate that could never be honoured.
      await assert.rejects(
        strangerSafe.write.executeAsSafe([
          module.address,
          encodeAuthorizeWriter(writerWallet.account.address),
        ]),
      );
    });

    it("cannot be granted by an owner EOA acting alone", async () => {
      const { module, outsiderWallet } = await deployModuleFixture();

      // An EOA calling authorizeWriter directly would be authorizing itself as a Safe, which
      // is exactly the bypass the mandate exists to prevent. isModuleEnabled on an address
      // with no code reverts, so the attempt cannot even record state.
      await assert.rejects(
        module.write.authorizeWriter([outsiderWallet.account.address], {
          account: outsiderWallet.account,
        }),
      );
    });

    it("reports the current mandate through authorizationOf", async () => {
      const { module, safe, writerWallet, writerNonce } = await deployModuleFixture();

      const [writer, nonce] = (await module.read.authorizationOf([safe.address])) as readonly [
        Address,
        number,
      ];
      assert.equal(writer.toLowerCase(), writerWallet.account.address.toLowerCase());
      assert.equal(nonce, writerNonce);
    });

    it("reports no mandate for a Safe that never granted one", async () => {
      const { viem, module } = await deployModuleFixture();
      const strangerSafe = await viem.deployContract("MockSafe", []);

      const [writer, nonce] = (await module.read.authorizationOf([strangerSafe.address])) as readonly [
        Address,
        number,
      ];
      assert.equal(writer, zeroAddress);
      assert.equal(nonce, 0);
    });
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
