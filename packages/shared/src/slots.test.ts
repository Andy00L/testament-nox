import { describe, expect, test } from "bun:test";
import { zeroAddress } from "viem";

import {
  BPS_DENOMINATOR,
  SLOT_COUNT,
  computePayout,
  isPaddedBequest,
  packBequest,
  packBequests,
  unpackBequest,
  type Bequest,
} from "./slots.ts";

const ALICE = "0x71De5E2141C89F7A6c5260d10D18CbC47fB1a7f2" as const;
const BOB = "0xe5aFeC35193B23B3AFD1B2C74613598714D5F484" as const;
const CAROL = "0x1F7481b60669d09404cf2b2493Cc6D7FE3155b8F" as const;

function expectPackFailure(result: ReturnType<typeof packBequests>): string {
  if (result.ok) {
    throw new Error("expected packBequests to fail");
  }
  return result.failure.reason;
}

describe("packBequest / unpackBequest", () => {
  test("round-trips a bequest through the packed layout", () => {
    const bequest: Bequest = { beneficiary: ALICE, shareBps: 2500 };
    expect(unpackBequest(packBequest(bequest))).toEqual(bequest);
  });

  test("keeps the address and the share in separate bit ranges", () => {
    const packed = packBequest({ beneficiary: ALICE, shareBps: 1 });
    // The low 16 bits carry the share, everything above carries the address.
    expect(packed & 0xffffn).toBe(1n);
    expect(packed >> 16n).toBe(BigInt(ALICE));
  });

  test("round-trips the widest share a will can hold", () => {
    const bequest: Bequest = { beneficiary: BOB, shareBps: BPS_DENOMINATOR };
    expect(unpackBequest(packBequest(bequest))).toEqual(bequest);
  });

  test("unpacks a padded slot to the zero address and a zero share", () => {
    const padded = unpackBequest(0n);
    expect(padded.beneficiary).toBe(zeroAddress);
    expect(padded.shareBps).toBe(0);
    expect(isPaddedBequest(padded)).toBe(true);
  });

  test("ignores bits above the address range", () => {
    const packed = packBequest({ beneficiary: ALICE, shareBps: 4000 });
    const withGarbageHighBits = packed | (1n << 200n);
    expect(unpackBequest(withGarbageHighBits)).toEqual({ beneficiary: ALICE, shareBps: 4000 });
  });
});

describe("packBequests", () => {
  test("pads every unused slot with an encrypted-zero placeholder", () => {
    const result = packBequests([
      { beneficiary: ALICE, shareBps: 6000 },
      { beneficiary: BOB, shareBps: 4000 },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.slots).toHaveLength(SLOT_COUNT);
    expect(result.slots.slice(2).every((slotValue) => slotValue === 0n)).toBe(true);
    expect(unpackBequest(result.slots[0] as bigint)).toEqual({ beneficiary: ALICE, shareBps: 6000 });
    expect(unpackBequest(result.slots[1] as bigint)).toEqual({ beneficiary: BOB, shareBps: 4000 });
  });

  test("accepts a will that fills every slot", () => {
    const bequests = Array.from({ length: SLOT_COUNT }, (_unused, index) => ({
      beneficiary: `0x${String(index + 1).repeat(40).slice(0, 40)}` as `0x${string}`,
      shareBps: BPS_DENOMINATOR / SLOT_COUNT,
    }));

    const result = packBequests(bequests);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.slots.filter((slotValue) => slotValue !== 0n)).toHaveLength(SLOT_COUNT);
  });

  test("rejects an empty will", () => {
    expect(expectPackFailure(packBequests([]))).toBe("no-bequests");
  });

  test("rejects more beneficiaries than there are slots", () => {
    const tooMany = Array.from({ length: SLOT_COUNT + 1 }, () => ({
      beneficiary: ALICE,
      shareBps: 1,
    }));
    expect(expectPackFailure(packBequests(tooMany))).toBe("too-many-bequests");
  });

  test("rejects a malformed address", () => {
    const result = packBequests([{ beneficiary: "0xnope" as `0x${string}`, shareBps: 10_000 }]);
    expect(expectPackFailure(result)).toBe("invalid-address");
  });

  test("rejects the zero address as a beneficiary", () => {
    const result = packBequests([{ beneficiary: zeroAddress, shareBps: 10_000 }]);
    expect(expectPackFailure(result)).toBe("zero-address");
  });

  test("rejects the same beneficiary named twice", () => {
    const result = packBequests([
      { beneficiary: ALICE, shareBps: 5000 },
      { beneficiary: ALICE, shareBps: 5000 },
    ]);
    expect(expectPackFailure(result)).toBe("duplicate-beneficiary");
  });

  test("treats a differently cased duplicate as a duplicate", () => {
    const result = packBequests([
      { beneficiary: ALICE, shareBps: 5000 },
      { beneficiary: ALICE.toLowerCase() as `0x${string}`, shareBps: 5000 },
    ]);
    expect(expectPackFailure(result)).toBe("duplicate-beneficiary");
  });

  test("rejects a zero share", () => {
    const result = packBequests([
      { beneficiary: ALICE, shareBps: 0 },
      { beneficiary: BOB, shareBps: 10_000 },
    ]);
    expect(expectPackFailure(result)).toBe("invalid-share");
  });

  test("rejects a fractional share", () => {
    const result = packBequests([
      { beneficiary: ALICE, shareBps: 5000.5 },
      { beneficiary: BOB, shareBps: 4999.5 },
    ]);
    expect(expectPackFailure(result)).toBe("invalid-share");
  });

  test("rejects a share above the denominator", () => {
    const result = packBequests([{ beneficiary: ALICE, shareBps: BPS_DENOMINATOR + 1 }]);
    expect(expectPackFailure(result)).toBe("invalid-share");
  });

  test("rejects shares that do not add up to the whole estate", () => {
    const result = packBequests([
      { beneficiary: ALICE, shareBps: 5000 },
      { beneficiary: BOB, shareBps: 4000 },
    ]);
    expect(expectPackFailure(result)).toBe("shares-do-not-sum-to-total");
  });

  test("rejects shares that add up to more than the whole estate", () => {
    const result = packBequests([
      { beneficiary: ALICE, shareBps: 6000 },
      { beneficiary: BOB, shareBps: 5000 },
    ]);
    expect(expectPackFailure(result)).toBe("shares-do-not-sum-to-total");
  });
});

describe("computePayout", () => {
  test("splits an estate the way the contract does", () => {
    const estateValueWei = 1_000_000_000_000_000_000n;
    expect(computePayout(estateValueWei, 6000)).toBe(600_000_000_000_000_000n);
    expect(computePayout(estateValueWei, 4000)).toBe(400_000_000_000_000_000n);
  });

  test("truncates rather than rounds, matching Solidity integer division", () => {
    // 7 wei at 3333 bps is 2.3331 wei, and a third of 1 wei is nothing at all.
    expect(computePayout(7n, 3333)).toBe(2n);
    expect(computePayout(1n, 3333)).toBe(0n);
    expect(computePayout(10_001n, 3333)).toBe(3333n);
  });

  test("never distributes more than the estate", () => {
    const estateValueWei = 123_456_789n;
    const bequests: Bequest[] = [
      { beneficiary: ALICE, shareBps: 3333 },
      { beneficiary: BOB, shareBps: 3333 },
      { beneficiary: CAROL, shareBps: 3334 },
    ];
    const total = bequests.reduce(
      (runningTotal, bequest) => runningTotal + computePayout(estateValueWei, bequest.shareBps),
      0n,
    );
    expect(total).toBeLessThanOrEqual(estateValueWei);
  });
});
