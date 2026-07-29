import { getAddress, isAddress, zeroAddress, type Address } from "viem";

/**
 * Beneficiary slots per testament.
 * sourceRef: packages/contracts/contracts/TestamentRegistry.sol, `SLOTS`.
 * Every testament always writes and reads exactly this many slots, which is what keeps
 * the beneficiary count hidden: an unused slot is an encrypted zero and costs the same.
 */
export const SLOT_COUNT = 8;

/**
 * Basis points denominator. Unit: bps, 10000 bps == 100%.
 * sourceRef: packages/contracts/contracts/TestamentRegistry.sol, `BPS_DENOMINATOR`.
 */
export const BPS_DENOMINATOR = 10_000;

/**
 * Bit width reserved for the share inside a packed slot. Unit: bits.
 * sourceRef: packages/contracts/contracts/TestamentRegistry.sol, `SHARE_BITS`.
 */
const SHARE_BITS = 16n;

/** Mask covering the share half of a packed slot. Covers SHARE_BITS bits. */
const SHARE_MASK = 0xffffn;

/** Mask covering the address half of a packed slot. Covers 160 bits. */
const ADDRESS_MASK = (1n << 160n) - 1n;

/** Hex characters in a 20-byte address. */
const ADDRESS_HEX_LENGTH = 40;

/** A single line of a will: who inherits, and how much of the estate. */
export type Bequest = {
  beneficiary: Address;
  /** Unit: bps. 2500 means 25% of the Safe balance at execution time. */
  shareBps: number;
};

export type PackBequestsFailure =
  | { reason: "too-many-bequests"; count: number; maximum: number }
  | { reason: "no-bequests" }
  | { reason: "invalid-address"; index: number; value: string }
  | { reason: "zero-address"; index: number }
  | { reason: "duplicate-beneficiary"; index: number; beneficiary: Address }
  | { reason: "invalid-share"; index: number; shareBps: number }
  | { reason: "shares-do-not-sum-to-total"; total: number; expected: number };

export type PackBequestsResult =
  | { ok: true; slots: bigint[] }
  | { ok: false; failure: PackBequestsFailure };

/**
 * Packs one bequest into the single uint256 a testament slot holds.
 *
 * Layout, from the low bit up: 16 bits of share in basis points, then 160 bits of
 * beneficiary address. One encrypted value per beneficiary rather than two means half
 * the Handle Gateway round trips, half the calldata, and no way for an address to end
 * up paired with the wrong share.
 */
export function packBequest(bequest: Bequest): bigint {
  return (BigInt(bequest.beneficiary) << SHARE_BITS) | BigInt(bequest.shareBps);
}

/** Reverses `packBequest`. A padded slot unpacks to the zero address and a zero share. */
export function unpackBequest(packedSlot: bigint): Bequest {
  const addressBits = (packedSlot >> SHARE_BITS) & ADDRESS_MASK;
  const beneficiary = getAddress(`0x${addressBits.toString(16).padStart(ADDRESS_HEX_LENGTH, "0")}`);
  return { beneficiary, shareBps: Number(packedSlot & SHARE_MASK) };
}

/** Whether an unpacked slot carries no bequest, either padding or an emptied slot. */
export function isPaddedBequest(bequest: Bequest): boolean {
  return bequest.beneficiary === zeroAddress || bequest.shareBps === 0;
}

/**
 * Validates a will and turns it into exactly SLOT_COUNT plaintext slot values, ready to
 * be handed one by one to the Nox SDK.
 *
 * The padding is the privacy mechanism, so it is produced here rather than on-chain:
 * the contract cannot pad with an encrypted zero without publishing a plaintext zero
 * first (`Nox.toEuint256` wraps a value that stays visible on-chain), which would reveal
 * exactly which slots are unused. Encrypting the zeros client-side, through the same
 * call as a real slot, makes padding indistinguishable.
 * sourceRef: docs.noxprotocol.io /references/solidity-library/methods/core-primitives/
 * wrap-as-public-handle, "the value you pass here is visible in plain text on-chain".
 */
export function packBequests(bequests: readonly Bequest[]): PackBequestsResult {
  if (bequests.length === 0) {
    return { ok: false, failure: { reason: "no-bequests" } };
  }
  if (bequests.length > SLOT_COUNT) {
    return {
      ok: false,
      failure: { reason: "too-many-bequests", count: bequests.length, maximum: SLOT_COUNT },
    };
  }

  const seenBeneficiaries = new Set<string>();
  let totalShareBps = 0;

  for (const [index, bequest] of bequests.entries()) {
    if (!isAddress(bequest.beneficiary)) {
      return {
        ok: false,
        failure: { reason: "invalid-address", index, value: String(bequest.beneficiary) },
      };
    }
    if (bequest.beneficiary === zeroAddress) {
      return { ok: false, failure: { reason: "zero-address", index } };
    }

    const normalizedBeneficiary = getAddress(bequest.beneficiary);
    if (seenBeneficiaries.has(normalizedBeneficiary)) {
      return {
        ok: false,
        failure: { reason: "duplicate-beneficiary", index, beneficiary: normalizedBeneficiary },
      };
    }
    seenBeneficiaries.add(normalizedBeneficiary);

    const isValidShare =
      Number.isInteger(bequest.shareBps) &&
      bequest.shareBps > 0 &&
      bequest.shareBps <= BPS_DENOMINATOR;
    if (!isValidShare) {
      return { ok: false, failure: { reason: "invalid-share", index, shareBps: bequest.shareBps } };
    }
    totalShareBps += bequest.shareBps;
  }

  if (totalShareBps !== BPS_DENOMINATOR) {
    return {
      ok: false,
      failure: {
        reason: "shares-do-not-sum-to-total",
        total: totalShareBps,
        expected: BPS_DENOMINATOR,
      },
    };
  }

  const slots = Array.from({ length: SLOT_COUNT }, (_unused, index) => {
    const bequest = bequests[index];
    return bequest === undefined ? 0n : packBequest(bequest);
  });

  return { ok: true, slots };
}

/**
 * The exact amount a share is worth against a given estate, using the contract's
 * truncating integer division so the app never promises a wei the Safe will not send.
 * sourceRef: packages/contracts/contracts/TestamentRegistry.sol, `execute`.
 */
export function computePayout(estateValueWei: bigint, shareBps: number): bigint {
  return (estateValueWei * BigInt(shareBps)) / BigInt(BPS_DENOMINATOR);
}

/** Human-readable rendering of a packing failure, for UI and script output. */
export function describePackFailure(failure: PackBequestsFailure): string {
  switch (failure.reason) {
    case "no-bequests":
      return "A testament needs at least one beneficiary.";
    case "too-many-bequests":
      return `A testament holds at most ${failure.maximum} beneficiaries, got ${failure.count}.`;
    case "invalid-address":
      return `Beneficiary ${failure.index + 1} is not a valid address: ${failure.value}`;
    case "zero-address":
      return `Beneficiary ${failure.index + 1} is the zero address.`;
    case "duplicate-beneficiary":
      return `Beneficiary ${failure.index + 1} (${failure.beneficiary}) appears twice.`;
    case "invalid-share":
      return `Share ${failure.index + 1} must be a whole number between 1 and ${BPS_DENOMINATOR} bps, got ${failure.shareBps}.`;
    case "shares-do-not-sum-to-total":
      return `Shares add up to ${failure.total} bps, they must add up to ${failure.expected}.`;
  }
}
