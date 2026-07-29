import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { nox } from "@iexec-nox/nox-hardhat-plugin";
import {
  SLOT_COUNT,
  TESTAMENT_STATE,
  computePayout,
  packBequest,
  unpackBequest,
} from "@testament/shared";
import { parseEther, zeroAddress, type Hex } from "viem";

import {
  DEFAULT_ESTATE_WEI,
  TEST_GRACE_SECONDS,
  TEST_INTERVAL_SECONDS,
  deployTestamentFixture,
  fetchSlotProofs,
  padRawSlots,
  writeTestament,
  type TestamentFixture,
} from "./utils/testament-fixture.ts";
import { waitForHandlesResolved } from "./utils/handle-gateway.ts";

/** Each test boots against the local Nox stack, so the Handle Gateway round trips dominate. */
const TEST_TIMEOUT_MS = 300_000;

/** Seconds past the deadline the tests jump to before releasing. */
const PAST_DEADLINE_SECONDS = TEST_INTERVAL_SECONDS + TEST_GRACE_SECONDS + 1;

type TestamentRecord = readonly [
  owner: `0x${string}`,
  safe: `0x${string}`,
  interval: number,
  grace: number,
  lastHeartbeat: bigint,
  state: number,
];

async function readTestament(
  fixture: TestamentFixture,
  testamentId: bigint,
): Promise<TestamentRecord> {
  return (await fixture.registry.read.testamentOf([testamentId])) as TestamentRecord;
}

async function readSlotHandles(
  fixture: TestamentFixture,
  testamentId: bigint,
): Promise<Hex[]> {
  const handles = (await fixture.registry.read.slotsOf([testamentId])) as readonly Hex[];
  return [...handles];
}

/** Writes a two-beneficiary will, jumps past the deadline, and releases it. */
async function releaseDefaultTestament(fixture: TestamentFixture) {
  const [, beneficiaryA, beneficiaryB] = fixture.walletClients;
  if (beneficiaryA === undefined || beneficiaryB === undefined) {
    throw new Error("[releaseDefaultTestament] expected at least three wallet clients");
  }

  const testamentId = await writeTestament(fixture, {
    bequests: [
      { beneficiary: beneficiaryA.account.address, shareBps: 6000 },
      { beneficiary: beneficiaryB.account.address, shareBps: 4000 },
    ],
  });

  await fixture.networkHelpers.time.increase(PAST_DEADLINE_SECONDS);

  const releaseHash = await fixture.registry.write.release([testamentId]);
  await fixture.publicClient.waitForTransactionReceipt({ hash: releaseHash });

  const slotHandles = await readSlotHandles(fixture, testamentId);
  await waitForHandlesResolved(slotHandles);

  return { testamentId, slotHandles, beneficiaryA, beneficiaryB };
}

describe("TestamentRegistry", () => {
  describe("write", () => {
    it(
      "seals a will and leaves nothing readable on-chain",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const [, beneficiaryA] = fixture.walletClients;
        if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

        const testamentId = await writeTestament(fixture, {
          bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
        });

        assert.equal(testamentId, 1n);

        const [owner, safe, interval, grace, lastHeartbeat, state] = await readTestament(
          fixture,
          testamentId,
        );
        assert.equal(owner.toLowerCase(), fixture.ownerWallet.account.address.toLowerCase());
        assert.equal(safe.toLowerCase(), fixture.safe.address.toLowerCase());
        assert.equal(interval, TEST_INTERVAL_SECONDS);
        assert.equal(grace, TEST_GRACE_SECONDS);
        assert.equal(state, TESTAMENT_STATE.Active);
        assert.ok(lastHeartbeat > 0n);

        const slotHandles = await readSlotHandles(fixture, testamentId);
        assert.equal(slotHandles.length, SLOT_COUNT);
        // Every slot carries a real handle, padding included, so the count never leaks.
        assert.ok(slotHandles.every((handle) => handle !== `0x${"0".repeat(64)}`));
      },
    );

    it(
      "records the testament as the owner's active one",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const [, beneficiaryA] = fixture.walletClients;
        if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

        const testamentId = await writeTestament(fixture, {
          bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
        });

        const activeId = await fixture.registry.read.activeTestamentOf([
          fixture.ownerWallet.account.address,
        ]);
        assert.equal(activeId, testamentId);
      },
    );

    it(
      "lets the owner read their own will back, and nobody else",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const [, beneficiaryA] = fixture.walletClients;
        if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

        const testamentId = await writeTestament(fixture, {
          bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 7500 }],
        });

        const slotHandles = await readSlotHandles(fixture, testamentId);
        await waitForHandlesResolved(slotHandles);

        // addViewer(owner) at write time is what makes this work.
        const firstSlot = slotHandles[0];
        if (firstSlot === undefined) throw new Error("missing slot handle");
        const { value } = await nox.decrypt(firstSlot);
        assert.equal(typeof value, "bigint");
        assert.deepEqual(unpackBequest(value as bigint), {
          beneficiary: beneficiaryA.account.address,
          shareBps: 7500,
        });

        // Before release the plan must not be public, whatever anyone tries.
        await assert.rejects(
          nox.publicDecrypt(firstSlot),
          "an unreleased slot must not be publicly decryptable",
        );
      },
    );

    it("rejects a will that is not exactly SLOT_COUNT slots", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      const encrypted = await nox.encryptInput(
        packBequest({ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }),
        "uint256",
        fixture.registry.address,
      );

      await assert.rejects(
        fixture.registry.write.write([
          fixture.safe.address,
          TEST_INTERVAL_SECONDS,
          TEST_GRACE_SECONDS,
          [encrypted.handle],
          [encrypted.handleProof],
        ]),
      );
    });

    it("rejects an interval below the minimum", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      await assert.rejects(
        writeTestament(fixture, {
          bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
          interval: 30,
        }),
      );
    });

    it("rejects a zero Safe address", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      await assert.rejects(
        writeTestament(fixture, {
          bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
          safeAddress: zeroAddress,
        }),
      );
    });

    it("refuses a second will while one is active", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      const bequests = [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }];
      await writeTestament(fixture, { bequests });
      await assert.rejects(writeTestament(fixture, { bequests }));
    });
  });

  describe("heartbeat", () => {
    it("pushes the deadline back", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      const testamentId = await writeTestament(fixture, {
        bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
      });

      const deadlineBefore = await fixture.registry.read.deadlineOf([testamentId]);
      await fixture.networkHelpers.time.increase(30);

      const heartbeatHash = await fixture.registry.write.heartbeat([testamentId]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: heartbeatHash });

      const deadlineAfter = await fixture.registry.read.deadlineOf([testamentId]);
      assert.ok(
        (deadlineAfter as bigint) > (deadlineBefore as bigint),
        "a heartbeat must move the deadline forward",
      );
    });

    it("is refused to anyone but the owner", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA, outsider] = fixture.walletClients;
      if (beneficiaryA === undefined || outsider === undefined) {
        throw new Error("missing wallet clients");
      }

      const testamentId = await writeTestament(fixture, {
        bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
      });

      await assert.rejects(
        fixture.registry.write.heartbeat([testamentId], { account: outsider.account }),
      );
    });

    it(
      "still forgives an owner who comes back late, as long as nobody released",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const [, beneficiaryA] = fixture.walletClients;
        if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

        const testamentId = await writeTestament(fixture, {
          bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
        });

        await fixture.networkHelpers.time.increase(PAST_DEADLINE_SECONDS);
        assert.equal(await fixture.registry.read.isExpired([testamentId]), true);

        const heartbeatHash = await fixture.registry.write.heartbeat([testamentId]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: heartbeatHash });

        assert.equal(await fixture.registry.read.isExpired([testamentId]), false);
      },
    );

    it("is refused once the will is released", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { testamentId } = await releaseDefaultTestament(fixture);

      await assert.rejects(fixture.registry.write.heartbeat([testamentId]));
    });
  });

  describe("revoke", () => {
    it("clears the will and frees the owner to write a new one", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      const bequests = [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }];
      const testamentId = await writeTestament(fixture, { bequests });

      const revokeHash = await fixture.registry.write.revoke([testamentId]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: revokeHash });

      const [, , , , , state] = await readTestament(fixture, testamentId);
      assert.equal(state, TESTAMENT_STATE.Revoked);
      assert.equal(await fixture.registry.read.activeTestamentOf([
        fixture.ownerWallet.account.address,
      ]), 0n);

      const zeroHandle = `0x${"0".repeat(64)}`;
      const slotHandles = await readSlotHandles(fixture, testamentId);
      assert.ok(slotHandles.every((handle) => handle === zeroHandle), "slots must be cleared");

      const secondId = await writeTestament(fixture, { bequests });
      assert.equal(secondId, 2n);
    });

    it("is refused to anyone but the owner", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA, outsider] = fixture.walletClients;
      if (beneficiaryA === undefined || outsider === undefined) {
        throw new Error("missing wallet clients");
      }

      const testamentId = await writeTestament(fixture, {
        bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
      });

      await assert.rejects(
        fixture.registry.write.revoke([testamentId], { account: outsider.account }),
      );
    });

    it("puts the will permanently out of reach of release", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      const testamentId = await writeTestament(fixture, {
        bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
      });

      const revokeHash = await fixture.registry.write.revoke([testamentId]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: revokeHash });

      await fixture.networkHelpers.time.increase(PAST_DEADLINE_SECONDS);
      await assert.rejects(fixture.registry.write.release([testamentId]));
    });
  });

  describe("release", () => {
    it("is refused before the silence outlasts interval plus grace", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      const testamentId = await writeTestament(fixture, {
        bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
      });

      // Past the interval but still inside the grace window.
      await fixture.networkHelpers.time.increase(TEST_INTERVAL_SECONDS + 1);
      assert.equal(await fixture.registry.read.isExpired([testamentId]), false);
      await assert.rejects(fixture.registry.write.release([testamentId]));
    });

    it("can be triggered by a complete stranger once expired", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA, outsider] = fixture.walletClients;
      if (beneficiaryA === undefined || outsider === undefined) {
        throw new Error("missing wallet clients");
      }

      const testamentId = await writeTestament(fixture, {
        bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
      });

      await fixture.networkHelpers.time.increase(PAST_DEADLINE_SECONDS);

      const releaseHash = await fixture.registry.write.release([testamentId], {
        account: outsider.account,
      });
      await fixture.publicClient.waitForTransactionReceipt({ hash: releaseHash });

      const [, , , , , state] = await readTestament(fixture, testamentId);
      assert.equal(state, TESTAMENT_STATE.Released);
    });

    it("opens every slot to public decryption, padding included", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { slotHandles, beneficiaryA, beneficiaryB } = await releaseDefaultTestament(fixture);

      const decrypted = await Promise.all(
        slotHandles.map(async (slotHandle) => {
          const { value } = await nox.publicDecrypt(slotHandle);
          return unpackBequest(value as bigint);
        }),
      );

      assert.deepEqual(decrypted[0], {
        beneficiary: beneficiaryA.account.address,
        shareBps: 6000,
      });
      assert.deepEqual(decrypted[1], {
        beneficiary: beneficiaryB.account.address,
        shareBps: 4000,
      });
      for (const paddedSlot of decrypted.slice(2)) {
        assert.equal(paddedSlot.beneficiary, zeroAddress);
        assert.equal(paddedSlot.shareBps, 0);
      }
    });

    it("cannot be replayed", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { testamentId } = await releaseDefaultTestament(fixture);
      await assert.rejects(fixture.registry.write.release([testamentId]));
    });
  });

  describe("execute", () => {
    it(
      "pays every beneficiary their share of the Safe",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const { testamentId, slotHandles, beneficiaryA, beneficiaryB } =
          await releaseDefaultTestament(fixture);

        const balancesBefore = await Promise.all([
          fixture.publicClient.getBalance({ address: beneficiaryA.account.address }),
          fixture.publicClient.getBalance({ address: beneficiaryB.account.address }),
        ]);

        const proofs = await fetchSlotProofs(slotHandles);
        const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

        const balancesAfter = await Promise.all([
          fixture.publicClient.getBalance({ address: beneficiaryA.account.address }),
          fixture.publicClient.getBalance({ address: beneficiaryB.account.address }),
        ]);

        assert.equal(
          (balancesAfter[0] as bigint) - (balancesBefore[0] as bigint),
          computePayout(DEFAULT_ESTATE_WEI, 6000),
        );
        assert.equal(
          (balancesAfter[1] as bigint) - (balancesBefore[1] as bigint),
          computePayout(DEFAULT_ESTATE_WEI, 4000),
        );

        const [, , , , , state] = await readTestament(fixture, testamentId);
        assert.equal(state, TESTAMENT_STATE.Executed);
      },
    );

    it(
      "splits against one snapshot of the estate, not a shrinking balance",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const { testamentId, slotHandles } = await releaseDefaultTestament(fixture);

        const safeBalanceBefore = await fixture.publicClient.getBalance({
          address: fixture.safe.address,
        });

        const proofs = await fetchSlotProofs(slotHandles);
        const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

        const safeBalanceAfter = await fixture.publicClient.getBalance({
          address: fixture.safe.address,
        });

        // 6000 + 4000 bps against a single snapshot empties the Safe to the wei.
        assert.equal(safeBalanceBefore, DEFAULT_ESTATE_WEI);
        assert.equal(safeBalanceAfter, 0n);
      },
    );

    it("is refused before release", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      const testamentId = await writeTestament(fixture, {
        bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
      });

      const emptyProofs = Array.from({ length: SLOT_COUNT }, () => "0x" as Hex);
      await assert.rejects(fixture.registry.write.execute([testamentId, emptyProofs]));
    });

    it("cannot be replayed", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { testamentId, slotHandles } = await releaseDefaultTestament(fixture);

      const proofs = await fetchSlotProofs(slotHandles);
      const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

      await assert.rejects(fixture.registry.write.execute([testamentId, proofs]));
    });

    it("rejects a forged decryption proof", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { testamentId, slotHandles } = await releaseDefaultTestament(fixture);

      const proofs = await fetchSlotProofs(slotHandles);
      const [firstProof] = proofs;
      if (firstProof === undefined) throw new Error("missing proof");

      // Flip the last byte of the gateway signature. NoxCompute must refuse it, which is
      // what makes execute permissionless without trusting whoever calls it.
      const tamperedProof = `${firstProof.slice(0, -2)}${firstProof.endsWith("00") ? "01" : "00"}` as Hex;
      const tamperedProofs = [tamperedProof, ...proofs.slice(1)];

      await assert.rejects(fixture.registry.write.execute([testamentId, tamperedProofs]));
    });

    it("rejects the wrong number of proofs", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { testamentId, slotHandles } = await releaseDefaultTestament(fixture);

      const proofs = await fetchSlotProofs(slotHandles);
      await assert.rejects(fixture.registry.write.execute([testamentId, proofs.slice(0, 4)]));
    });

    it(
      "leaves an unfunded Safe recoverable instead of burning the execution",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture({ estateWei: 0n });
        const { testamentId, slotHandles } = await releaseDefaultTestament(fixture);

        const proofs = await fetchSlotProofs(slotHandles);
        await assert.rejects(fixture.registry.write.execute([testamentId, proofs]));

        // Still released, so funding the Safe and retrying works.
        const [, , , , , state] = await readTestament(fixture, testamentId);
        assert.equal(state, TESTAMENT_STATE.Released);

        const fundingHash = await fixture.ownerWallet.sendTransaction({
          to: fixture.safe.address,
          value: parseEther("1"),
        });
        await fixture.publicClient.waitForTransactionReceipt({ hash: fundingHash });

        const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

        const [, , , , , stateAfter] = await readTestament(fixture, testamentId);
        assert.equal(stateAfter, TESTAMENT_STATE.Executed);
      },
    );

    it(
      "caps an over-allocated will instead of over-paying or bricking",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const [, beneficiaryA, beneficiaryB] = fixture.walletClients;
        if (beneficiaryA === undefined || beneficiaryB === undefined) {
          throw new Error("missing wallet clients");
        }

        // 8000 + 8000 bps. The client-side packer refuses this, so the raw slots go in
        // directly to prove the on-chain defence works on its own.
        const testamentId = await writeTestament(fixture, {
          rawSlots: padRawSlots([
            packBequest({ beneficiary: beneficiaryA.account.address, shareBps: 8000 }),
            packBequest({ beneficiary: beneficiaryB.account.address, shareBps: 8000 }),
          ]),
        });

        await fixture.networkHelpers.time.increase(PAST_DEADLINE_SECONDS);
        const releaseHash = await fixture.registry.write.release([testamentId]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: releaseHash });

        const slotHandles = await readSlotHandles(fixture, testamentId);
        await waitForHandlesResolved(slotHandles);

        const balancesBefore = await Promise.all([
          fixture.publicClient.getBalance({ address: beneficiaryA.account.address }),
          fixture.publicClient.getBalance({ address: beneficiaryB.account.address }),
        ]);

        const proofs = await fetchSlotProofs(slotHandles);
        const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

        const balancesAfter = await Promise.all([
          fixture.publicClient.getBalance({ address: beneficiaryA.account.address }),
          fixture.publicClient.getBalance({ address: beneficiaryB.account.address }),
        ]);

        // First slot takes its full 8000 bps, the second is capped at the remaining 2000.
        assert.equal(
          (balancesAfter[0] as bigint) - (balancesBefore[0] as bigint),
          computePayout(DEFAULT_ESTATE_WEI, 8000),
        );
        assert.equal(
          (balancesAfter[1] as bigint) - (balancesBefore[1] as bigint),
          computePayout(DEFAULT_ESTATE_WEI, 2000),
        );
        assert.equal(
          await fixture.publicClient.getBalance({ address: fixture.safe.address }),
          0n,
        );
      },
    );

    it("fails loudly when the Safe never enabled the module", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture({ enableModule: false });
      const { testamentId, slotHandles } = await releaseDefaultTestament(fixture);

      const proofs = await fetchSlotProofs(slotHandles);
      await assert.rejects(fixture.registry.write.execute([testamentId, proofs]));
    });
  });

  describe("releasableIds", () => {
    it("reports only the testaments a keeper should act on", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      const bequests = [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }];
      const testamentId = await writeTestament(fixture, { bequests });

      const beforeDeadline = (await fixture.registry.read.releasableIds([1n, 10n])) as readonly bigint[];
      assert.ok(beforeDeadline.every((candidateId) => candidateId === 0n));

      await fixture.networkHelpers.time.increase(PAST_DEADLINE_SECONDS);

      const afterDeadline = (await fixture.registry.read.releasableIds([1n, 10n])) as readonly bigint[];
      assert.equal(afterDeadline[0], testamentId);
    });
  });
});
