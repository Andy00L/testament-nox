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
import { getAddress, parseEther, zeroAddress, type Hex } from "viem";

import { deployTestamentSystem } from "../lib/deployment.ts";

import {
  DEFAULT_ESTATE_WEI,
  TEST_GRACE_SECONDS,
  TEST_INTERVAL_SECONDS,
  authorizeWriterOnSafe,
  deployTestamentFixture,
  fetchSlotProofs,
  padRawSlots,
  prepareAnotherSafe,
  revokeWriterOnSafe,
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
  authNonce: number,
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
          bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
        });

        const slotHandles = await readSlotHandles(fixture, testamentId);
        await waitForHandlesResolved(slotHandles);

        // addViewer(owner) at write time is what makes this work.
        const firstSlot = slotHandles[0];
        if (firstSlot === undefined) throw new Error("missing slot handle");
        const { value } = await nox.decrypt(firstSlot);
        assert.equal(typeof value, "bigint");
        // unpackBequest returns a checksummed address, so the expectation is checksummed too.
        assert.deepEqual(unpackBequest(value as bigint), {
          beneficiary: getAddress(beneficiaryA.account.address),
          shareBps: 10_000,
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

  /**
   * The mandate is the whole authorization boundary. Enabling a Safe module hands it
   * unrestricted spending authority over that Safe, so every case below is a drained estate
   * if it ever regresses.
   */
  describe("authorization", () => {
    it(
      "refuses a writer the Safe never authorized, and leaves the estate untouched",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const [, outsider] = fixture.walletClients;
        if (outsider === undefined) throw new Error("missing outsider wallet");

        const estateBefore = await fixture.publicClient.getBalance({
          address: fixture.safe.address,
        });

        // The reported attack in one call: name a Safe you do not own but which has the
        // module enabled, put yourself down for all of it, wait out the minimum interval.
        await assert.rejects(
          writeTestament(fixture, {
            bequests: [{ beneficiary: outsider.account.address, shareBps: 10_000 }],
            account: outsider.account,
          }),
          /WriterNotAuthorized/,
        );

        assert.equal(
          await fixture.publicClient.getBalance({ address: fixture.safe.address }),
          estateBefore,
        );
        assert.equal(await fixture.registry.read.lastTestamentId(), 0n);
      },
    );

    it(
      "refuses even the Safe's own owner when no mandate was granted",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture({ authorizeOwner: false });
        const [, beneficiaryA] = fixture.walletClients;
        if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

        // Enabling the module is not consent to any particular will, and being an owner is
        // not the same as being named by a Safe transaction that cleared the threshold.
        await assert.rejects(
          writeTestament(fixture, {
            bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
          }),
          /WriterNotAuthorized/,
        );
      },
    );

    it("refuses a writer whose mandate was withdrawn", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      await revokeWriterOnSafe(fixture);

      await assert.rejects(
        writeTestament(fixture, {
          bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
        }),
        /WriterNotAuthorized/,
      );
    });

    it("records the will against its Safe and its mandate", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      const testamentId = await writeTestament(fixture, {
        bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
      });

      assert.equal(
        await fixture.registry.read.activeTestamentOfSafe([fixture.safe.address]),
        testamentId,
      );
      const [, , , , , , authNonce] = await readTestament(fixture, testamentId);
      assert.equal(authNonce, 1);
    });

    it(
      "refuses a second will on the same Safe, even from a newly mandated writer",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const [, beneficiaryA, secondWriter] = fixture.walletClients;
        if (beneficiaryA === undefined || secondWriter === undefined) {
          throw new Error("missing wallet clients");
        }

        await writeTestament(fixture, {
          bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
        });

        // Handing the mandate on does not clear the will already drawn against the estate.
        // Keyed by Safe, so two live wills can never compete over one balance.
        await authorizeWriterOnSafe(fixture, secondWriter.account.address);

        await assert.rejects(
          writeTestament(fixture, {
            bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
            account: secondWriter.account,
          }),
          /SafeAlreadyHasTestament/,
        );
      },
    );

    it(
      "stops a released will paying out once the Safe withdraws the mandate",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const { testamentId, slotHandles } = await releaseDefaultTestament(fixture);
        const proofs = await fetchSlotProofs(slotHandles);

        await revokeWriterOnSafe(fixture);

        // Checking the mandate only at write time would leave this will armed. The module
        // re-checks against the Safe's state right now, which is what closes that window.
        await assert.rejects(
          fixture.registry.write.execute([testamentId, proofs]),
          /WriterNotAuthorized/,
        );
        assert.equal(
          await fixture.publicClient.getBalance({ address: fixture.safe.address }),
          DEFAULT_ESTATE_WEI,
        );
      },
    );

    it(
      "stops a released will paying out once the mandate is reissued to the same writer",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const { testamentId, slotHandles } = await releaseDefaultTestament(fixture);
        const proofs = await fetchSlotProofs(slotHandles);

        // Same address, new mandate. The nonce moved, so the old will is spent paper and
        // cannot be replayed against the estate.
        await authorizeWriterOnSafe(fixture, fixture.ownerWallet.account.address);

        await assert.rejects(
          fixture.registry.write.execute([testamentId, proofs]),
          /AuthorizationRotated/,
        );
      },
    );

    it(
      "refuses a will once the Safe has disabled the module",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const [, beneficiaryA] = fixture.walletClients;
        if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

        const disableHash = await fixture.safe.write.disableModule([fixture.module.address]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: disableHash });

        // The mandate survives a disabled module, but a will written now could never be
        // paid, so it is refused at the door rather than years after the owner is gone.
        await assert.rejects(
          writeTestament(fixture, {
            bequests: [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }],
          }),
          /ModuleNotEnabled/,
        );
      },
    );

    it(
      "does not carry a mandate over to a freshly deployed pair",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();

        // A mandate lives on one module, and each registry is welded to one module at
        // construction. Redeploying the pair therefore starts every Safe back at no mandate,
        // which is what stops an authorization outliving the code it was granted against.
        const second = await deployTestamentSystem(
          fixture.viem,
          fixture.publicClient,
          fixture.ownerWallet.account.address,
        );
        if (!second.ok) throw new Error(`second deployment failed: ${second.failure.reason}`);

        const secondModule = await fixture.viem.getContractAt(
          "TestamentModule",
          second.deployment.moduleAddress,
        );
        const [writer, nonce] = (await secondModule.read.authorizationOf([
          fixture.safe.address,
        ])) as readonly [string, number];

        assert.equal(writer, zeroAddress);
        assert.equal(nonce, 0);
      },
    );

    it(
      "spends the mandate, so one authorization buys exactly one will",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const [, beneficiaryA] = fixture.walletClients;
        if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

        const bequests = [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }];
        const firstId = await writeTestament(fixture, { bequests });

        // Clear the way, so the only thing left standing between here and a second will is
        // the spent mandate rather than the per-Safe or per-owner slot.
        const revokeHash = await fixture.registry.write.revoke([firstId]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: revokeHash });
        assert.equal(await fixture.registry.read.activeTestamentOfSafe([fixture.safe.address]), 0n);

        await assert.rejects(
          writeTestament(fixture, { bequests }),
          /AuthorizationAlreadyUsed/,
        );

        // The Safe says yes again, and the way is open.
        await authorizeWriterOnSafe(fixture, fixture.ownerWallet.account.address);
        const secondId = await writeTestament(fixture, { bequests });
        assert.equal(secondId, firstId + 1n);
      },
    );

    it(
      "spending the mandate does not invalidate the will it just created",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const { testamentId, slotHandles } = await releaseDefaultTestament(fixture);

        // Consumption is recorded separately from the mandate itself, so the will still
        // matches the Safe's current writer and nonce when the module re-checks at payout.
        // Getting this wrong would make every testament unpayable the moment it was written.
        const proofs = await fetchSlotProofs(slotHandles);
        const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

        const [, , , , , state] = await readTestament(fixture, testamentId);
        assert.equal(state, TESTAMENT_STATE.Executed);
      },
    );

    it(
      "lets a second Safe hold its own will, unaffected by the first",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const [, beneficiaryA] = fixture.walletClients;
        if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

        const otherSafe = await prepareAnotherSafe(fixture, fixture.ownerWallet.account.address);
        const bequests = [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }];
        const firstId = await writeTestament(fixture, { bequests });

        // The second Safe is untouched by the first Safe's will.
        assert.equal(await fixture.registry.read.activeTestamentOfSafe([otherSafe.address]), 0n);

        // Only the per-writer limit stands in the way here, not anything to do with the Safe:
        // the plugin encrypts with one account, so both wills would share a writer. Clearing
        // that limit shows the second Safe was never blocked.
        const revokeHash = await fixture.registry.write.revoke([firstId]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: revokeHash });

        const secondId = await writeTestament(fixture, { bequests, safeAddress: otherSafe.address });
        assert.equal(
          await fixture.registry.read.activeTestamentOfSafe([otherSafe.address]),
          secondId,
        );
        assert.equal(await fixture.registry.read.activeTestamentOfSafe([fixture.safe.address]), 0n);
      },
    );

    it("frees the Safe again once the owner revokes", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      const bequests = [{ beneficiary: beneficiaryA.account.address, shareBps: 10_000 }];
      const firstId = await writeTestament(fixture, { bequests });

      const revokeHash = await fixture.registry.write.revoke([firstId]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: revokeHash });

      // Both the per-owner and the per-Safe slot have to clear, or the estate stays locked
      // out of ever having a will again.
      assert.equal(await fixture.registry.read.activeTestamentOfSafe([fixture.safe.address]), 0n);

      // The mandate went with the revoked will, so the Safe has to grant a new one.
      await authorizeWriterOnSafe(fixture, fixture.ownerWallet.account.address);
      const secondId = await writeTestament(fixture, { bequests });
      assert.equal(secondId, firstId + 1n);
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

      // The revoked will spent the Safe's mandate, so writing again needs a fresh one.
      await authorizeWriterOnSafe(fixture, fixture.ownerWallet.account.address);
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
        beneficiary: getAddress(beneficiaryA.account.address),
        shareBps: 6000,
      });
      assert.deepEqual(decrypted[1], {
        beneficiary: getAddress(beneficiaryB.account.address),
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

    it(
      "fails loudly when the Safe disabled the module after the will was written",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const { testamentId, slotHandles } = await releaseDefaultTestament(fixture);

        // A Safe can always walk away. Safe answers a disabled module with GS104, and that
        // has to abort the payout rather than read as one heir refusing their share.
        const disableHash = await fixture.safe.write.disableModule([fixture.module.address]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: disableHash });

        const proofs = await fetchSlotProofs(slotHandles);
        await assert.rejects(fixture.registry.write.execute([testamentId, proofs]));
      },
    );

    it("clears the Safe's slot once the estate is paid", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { testamentId, slotHandles } = await releaseDefaultTestament(fixture);

      const proofs = await fetchSlotProofs(slotHandles);
      const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

      assert.equal(await fixture.registry.read.activeTestamentOfSafe([fixture.safe.address]), 0n);
    });

    it(
      "records what the Safe actually paid, not what the will planned",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const [, beneficiaryA] = fixture.walletClients;
        if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

        const rejectingReceiver = await fixture.viem.deployContract("RejectingReceiver", []);

        const testamentId = await writeTestament(fixture, {
          rawSlots: padRawSlots([
            packBequest({ beneficiary: beneficiaryA.account.address, shareBps: 6000 }),
            packBequest({ beneficiary: rejectingReceiver.address, shareBps: 4000 }),
          ]),
        });

        await fixture.networkHelpers.time.increase(PAST_DEADLINE_SECONDS);
        const releaseHash = await fixture.registry.write.release([testamentId]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: releaseHash });

        const slotHandles = await readSlotHandles(fixture, testamentId);
        await waitForHandlesResolved(slotHandles);
        const proofs = await fetchSlotProofs(slotHandles);

        const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
        const receipt = await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

        const [executed] = await fixture.publicClient.getLogs({
          address: fixture.registry.address,
          event: {
            type: "event",
            name: "TestamentExecuted",
            inputs: [
              { name: "testamentId", type: "uint256", indexed: true },
              { name: "executedBy", type: "address", indexed: true },
              { name: "plannedAmount", type: "uint256", indexed: false },
              { name: "paidAmount", type: "uint256", indexed: false },
              { name: "failedAmount", type: "uint256", indexed: false },
            ],
          },
          fromBlock: receipt.blockNumber,
          toBlock: receipt.blockNumber,
        });
        if (executed === undefined) throw new Error("missing TestamentExecuted event");

        // The refusing heir's share is reported as failed and never folded into the paid
        // total. A will that reached three heirs out of four must not go on record as four.
        assert.equal(executed.args.plannedAmount, DEFAULT_ESTATE_WEI);
        assert.equal(executed.args.paidAmount, computePayout(DEFAULT_ESTATE_WEI, 6000));
        assert.equal(executed.args.failedAmount, computePayout(DEFAULT_ESTATE_WEI, 4000));
      },
    );

    it("refuses a will that pays nobody", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();

      // Eight encrypted zeros: a broken client, or a deliberate attempt to spend the one
      // execution a testament gets and strand a funded Safe behind a spent will.
      const testamentId = await writeTestament(fixture, { rawSlots: padRawSlots([]) });

      await fixture.networkHelpers.time.increase(PAST_DEADLINE_SECONDS);
      const releaseHash = await fixture.registry.write.release([testamentId]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: releaseHash });

      const slotHandles = await readSlotHandles(fixture, testamentId);
      await waitForHandlesResolved(slotHandles);
      const proofs = await fetchSlotProofs(slotHandles);

      await assert.rejects(
        fixture.registry.write.execute([testamentId, proofs]),
        /NoValidBequests/,
      );
      assert.equal(
        await fixture.publicClient.getBalance({ address: fixture.safe.address }),
        DEFAULT_ESTATE_WEI,
      );
    });
  });

  /**
   * A will that could not reach every heir is not finished. These cover the whole of that:
   * what the record says, what the Safe still owes, and who can settle it.
   */
  describe("partial execution and retry", () => {
    /** Slot 0 is a wallet, slot 1 a contract that refuses ETH. Released, proofs in hand. */
    async function releaseWillWithRefusingHeir(fixture: TestamentFixture) {
      const [, beneficiaryA] = fixture.walletClients;
      if (beneficiaryA === undefined) throw new Error("missing beneficiary wallet");

      const refusingHeir = await fixture.viem.deployContract("RejectingReceiver", []);
      const testamentId = await writeTestament(fixture, {
        rawSlots: padRawSlots([
          packBequest({ beneficiary: beneficiaryA.account.address, shareBps: 6000 }),
          packBequest({ beneficiary: refusingHeir.address, shareBps: 4000 }),
        ]),
      });

      await fixture.networkHelpers.time.increase(PAST_DEADLINE_SECONDS);
      const releaseHash = await fixture.registry.write.release([testamentId]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: releaseHash });

      const slotHandles = await readSlotHandles(fixture, testamentId);
      await waitForHandlesResolved(slotHandles);
      const proofs = await fetchSlotProofs(slotHandles);

      return { testamentId, proofs, refusingHeir, beneficiaryA };
    }

    it(
      "pays the heirs it can reach and leaves the will partially executed",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const { testamentId, proofs, beneficiaryA } = await releaseWillWithRefusingHeir(fixture);

        const balanceBefore = await fixture.publicClient.getBalance({
          address: beneficiaryA.account.address,
        });

        const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

        // The heir that could be reached is paid in full.
        const balanceAfter = await fixture.publicClient.getBalance({
          address: beneficiaryA.account.address,
        });
        assert.equal(balanceAfter - balanceBefore, computePayout(DEFAULT_ESTATE_WEI, 6000));

        // The will is not finished, and says so.
        const [, , , , , state] = await readTestament(fixture, testamentId);
        assert.equal(state, TESTAMENT_STATE.PartiallyExecuted);

        // Slot 0 settled, slot 1 still owed.
        assert.equal(await fixture.registry.read.paidSlots([testamentId]), 0b0000_0001);
        assert.equal(await fixture.registry.read.plannedSlots([testamentId]), 0b0000_0011);
        assert.equal(await fixture.registry.read.unpaidSlots([testamentId]), 0b0000_0010);

        // The refused share is still in the Safe, not lost.
        assert.equal(
          await fixture.publicClient.getBalance({ address: fixture.safe.address }),
          computePayout(DEFAULT_ESTATE_WEI, 4000),
        );
      },
    );

    it(
      "keeps its hold on the Safe while an heir is still owed",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const { testamentId, proofs } = await releaseWillWithRefusingHeir(fixture);

        const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

        // Freeing the Safe here would let a second will be drawn against an estate that
        // still owes money to the first one.
        assert.equal(
          await fixture.registry.read.activeTestamentOfSafe([fixture.safe.address]),
          testamentId,
        );
      },
    );

    it(
      "settles the refused heir on retry and finishes the will",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const { testamentId, proofs, refusingHeir } = await releaseWillWithRefusingHeir(fixture);

        const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

        // The heir sorts out whatever was wrong with its wallet.
        const acceptHash = await refusingHeir.write.setAccepts([true]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: acceptHash });

        // Anyone may settle it, so a stranger does.
        const [, , stranger] = fixture.walletClients;
        if (stranger === undefined) throw new Error("missing stranger wallet");
        const retryHash = await fixture.registry.write.retryPayment([testamentId, 1], {
          account: stranger.account,
        });
        await fixture.publicClient.waitForTransactionReceipt({ hash: retryHash });

        assert.equal(
          await fixture.publicClient.getBalance({ address: refusingHeir.address }),
          computePayout(DEFAULT_ESTATE_WEI, 4000),
        );

        const [, , , , , state] = await readTestament(fixture, testamentId);
        assert.equal(state, TESTAMENT_STATE.Executed);
        assert.equal(await fixture.registry.read.unpaidSlots([testamentId]), 0);

        // Finished at last, so the Safe is free and the estate is empty.
        assert.equal(
          await fixture.registry.read.activeTestamentOfSafe([fixture.safe.address]),
          0n,
        );
        assert.equal(
          await fixture.publicClient.getBalance({ address: fixture.safe.address }),
          0n,
        );
      },
    );

    it("refuses to pay a slot twice", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { testamentId, proofs, refusingHeir } = await releaseWillWithRefusingHeir(fixture);

      const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

      // Slot 0 was paid during execution. Asking again must not send a second share.
      await assert.rejects(
        fixture.registry.write.retryPayment([testamentId, 0]),
        /SlotAlreadyPaid/,
      );

      const acceptHash = await refusingHeir.write.setAccepts([true]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: acceptHash });
      const retryHash = await fixture.registry.write.retryPayment([testamentId, 1]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: retryHash });

      // And once settled, that slot is closed too.
      await assert.rejects(
        fixture.registry.write.retryPayment([testamentId, 1]),
        /UnexpectedState|SlotAlreadyPaid/,
      );
    });

    it("refuses a retry on a slot the will never owed", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { testamentId, proofs } = await releaseWillWithRefusingHeir(fixture);

      const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

      // Slot 5 is padding: an encrypted zero that was never a bequest.
      await assert.rejects(
        fixture.registry.write.retryPayment([testamentId, 5]),
        /SlotNotPlanned/,
      );
      await assert.rejects(
        fixture.registry.write.retryPayment([testamentId, 8]),
        /SlotOutOfRange/,
      );
    });

    it("refuses a retry before the will was ever executed", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { testamentId } = await releaseWillWithRefusingHeir(fixture);

      await assert.rejects(
        fixture.registry.write.retryPayment([testamentId, 1]),
        /UnexpectedState/,
      );
    });

    it("lists itself as retryable, so a keeper can find it", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { testamentId, proofs, refusingHeir } = await releaseWillWithRefusingHeir(fixture);

      const beforeExecution = (await fixture.registry.read.retryableIds([
        1n,
        10n,
      ])) as readonly bigint[];
      assert.ok(beforeExecution.every((candidateId) => candidateId === 0n));

      const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

      // This plus unpaidSlots is everything the keeper needs to finish the estate on its own.
      const afterExecution = (await fixture.registry.read.retryableIds([
        1n,
        10n,
      ])) as readonly bigint[];
      assert.equal(afterExecution[0], testamentId);

      const acceptHash = await refusingHeir.write.setAccepts([true]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: acceptHash });
      const retryHash = await fixture.registry.write.retryPayment([testamentId, 1]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: retryHash });

      const afterSettlement = (await fixture.registry.read.retryableIds([
        1n,
        10n,
      ])) as readonly bigint[];
      assert.ok(afterSettlement.every((candidateId) => candidateId === 0n));
    });

    it(
      "reports the settled plan for the interface to read back",
      { timeout: TEST_TIMEOUT_MS },
      async () => {
        const fixture = await deployTestamentFixture();
        const { testamentId, proofs, refusingHeir, beneficiaryA } =
          await releaseWillWithRefusingHeir(fixture);

        const executeHash = await fixture.registry.write.execute([testamentId, proofs]);
        await fixture.publicClient.waitForTransactionReceipt({ hash: executeHash });

        const paidSlot = (await fixture.registry.read.plannedPaymentOf([testamentId, 0])) as readonly [
          string,
          bigint,
          boolean,
        ];
        assert.equal(paidSlot[0].toLowerCase(), beneficiaryA.account.address.toLowerCase());
        assert.equal(paidSlot[1], computePayout(DEFAULT_ESTATE_WEI, 6000));
        assert.equal(paidSlot[2], true);

        const owedSlot = (await fixture.registry.read.plannedPaymentOf([testamentId, 1])) as readonly [
          string,
          bigint,
          boolean,
        ];
        assert.equal(owedSlot[0].toLowerCase(), refusingHeir.address.toLowerCase());
        assert.equal(owedSlot[1], computePayout(DEFAULT_ESTATE_WEI, 4000));
        assert.equal(owedSlot[2], false);
      },
    );
  });

  describe("executionReadiness", () => {
    it("reports a released will that is ready to pay", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { testamentId } = await releaseDefaultTestament(fixture);

      const readiness = (await fixture.registry.read.executionReadiness([
        testamentId,
      ])) as readonly boolean[];
      assert.deepEqual([...readiness], [true, true, true, true]);
    });

    it("names the disabled module as the blocker", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { testamentId } = await releaseDefaultTestament(fixture);

      const disableHash = await fixture.safe.write.disableModule([fixture.module.address]);
      await fixture.publicClient.waitForTransactionReceipt({ hash: disableHash });

      const [moduleEnabled, writerAuthorized, , executable] =
        (await fixture.registry.read.executionReadiness([testamentId])) as readonly boolean[];
      assert.equal(moduleEnabled, false);
      assert.equal(writerAuthorized, true);
      assert.equal(executable, false);
    });

    it("names the withdrawn mandate as the blocker", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture();
      const { testamentId } = await releaseDefaultTestament(fixture);

      await revokeWriterOnSafe(fixture);

      const [moduleEnabled, writerAuthorized, , executable] =
        (await fixture.registry.read.executionReadiness([testamentId])) as readonly boolean[];
      assert.equal(moduleEnabled, true);
      assert.equal(writerAuthorized, false);
      assert.equal(executable, false);
    });

    it("names an empty estate as the blocker", { timeout: TEST_TIMEOUT_MS }, async () => {
      const fixture = await deployTestamentFixture({ estateWei: 0n });
      const { testamentId } = await releaseDefaultTestament(fixture);

      const [, , safeFunded, executable] = (await fixture.registry.read.executionReadiness([
        testamentId,
      ])) as readonly boolean[];
      assert.equal(safeFunded, false);
      assert.equal(executable, false);
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
