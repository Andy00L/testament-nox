import { BPS_DENOMINATOR, type PackBequestsFailure } from "@testament/shared";

import type { Copy } from "@/lib/i18n";
import type { WriteFailure, WriteStep } from "@/lib/testament-write";

/**
 * Turning a failure value into a sentence, in whichever language the page is set to.
 *
 * The chain helpers return reasons rather than prose on purpose, so this is the single place
 * that decides how a failure reads. Both languages then live in the typed dictionary, where
 * forgetting one is a compile error rather than a French sentence on an English page.
 */
export function describeWriteFailure(failure: WriteFailure, copy: Copy): string {
  switch (failure.reason) {
    case "not-connected":
      return copy.errors.notConnected;
    case "invalid-will":
      return describePackFailureIn(failure.packFailure, copy);
    case "encryption-failed":
      return failure.slotIndex === null
        ? copy.errors.encryptionFailed(failure.detail)
        : copy.errors.encryptionFailedSlot(failure.slotIndex + 1, failure.detail);
    case "rejected": {
      const byStep: Record<WriteStep, string> = {
        seal: copy.errors.sealRejected,
        "create-safe": copy.errors.vaultCreateRejected,
        "fund-safe": copy.errors.vaultFundRejected,
        "enable-module": copy.errors.safeRejectedEnable,
        "authorize-writer": copy.errors.safeRejectedAuthorize,
        release: copy.errors.releaseRejected,
        execute: copy.errors.executeRejected,
        retry: copy.errors.retryRejected,
      };
      return byStep[failure.step];
    }
    case "consent-not-visible":
      return copy.errors.consentNotVisible;
    case "safe-unreadable":
      return copy.errors.safeUnreadable(failure.detail);
    case "wrong-safe-owner":
      return copy.errors.vaultWrongOwner(failure.safeAddress);
    case "invalid-amount":
      return copy.errors.vaultAmountInvalid;
    case "transaction-failed":
      // A wallet or node string, quoted as it arrived. Inventing a translation for it would
      // mean guessing at what a wallet meant, which is worse than showing its own words.
      return failure.detail;
  }
}

/**
 * The same job for the shared packer's failures.
 *
 * `describePackFailure` in the shared package renders these in English for script output;
 * the interface needs them in the reader's language, from the same structured value.
 */
export function describePackFailureIn(failure: PackBequestsFailure, copy: Copy): string {
  switch (failure.reason) {
    case "no-bequests":
      return copy.errors.willNoBequests;
    case "too-many-bequests":
      return copy.errors.willTooManyBequests(failure.maximum, failure.count);
    case "invalid-address":
      return copy.errors.willInvalidAddress(failure.index + 1, failure.value);
    case "zero-address":
      return copy.errors.willZeroAddress(failure.index + 1);
    case "duplicate-beneficiary":
      return copy.errors.willDuplicate(failure.index + 1, failure.beneficiary);
    case "invalid-share":
      return copy.errors.willInvalidShare(failure.index + 1, BPS_DENOMINATOR, failure.shareBps);
    case "shares-do-not-sum-to-total":
      return copy.errors.willSharesDoNotSum(failure.total, failure.expected);
  }
}
