"use client";

import { useEffect, useRef, useState } from "react";
import { isAddress, type Address } from "viem";
import { usePublicClient } from "wagmi";

/**
 * Whether an heir's address is a plain wallet or a contract.
 *
 * Why the interface asks at all: `distribute` sends ETH to each heir in turn, and a contract
 * with no payable `receive` refuses it. The module already handles that correctly (it records
 * the refusal, pays everyone it can, and leaves the money in the Safe for a retry), so this
 * is not a validation that blocks anything. It is a warning at the moment the address is
 * typed, months before the payout, when it still costs nothing to change.
 *
 * The check cannot be stronger than this without lying. Code at an address does not prove the
 * transfer will fail: a Safe is a contract and accepts ETH happily. So the wording warns
 * about a possibility rather than announcing a fault, and the retry path stays the real
 * answer.
 */

export type HeirAddressKind = "wallet" | "contract";

/**
 * Resolves the kind of every valid address handed to it, and remembers answers across
 * renders. Addresses that are still being typed simply have no entry.
 */
export function useHeirAddressKinds(addresses: readonly string[]): ReadonlyMap<string, HeirAddressKind> {
  const publicClient = usePublicClient();
  const [kinds, setKinds] = useState<ReadonlyMap<string, HeirAddressKind>>(new Map());

  /**
   * Answers already fetched, keyed by lowercased address. Held in a ref so a re-render caused
   * by one answer does not re-request the others, and so the effect below can stay keyed on
   * the address list alone.
   */
  const answeredRef = useRef(new Map<string, HeirAddressKind>());

  const checkable = addresses.filter((candidate) => isAddress(candidate)).map((candidate) => candidate.toLowerCase());
  const checkableKey = checkable.join(",");

  // External system: the chain. Whether an address holds code is not something React owns,
  // and it can only be answered over the network.
  useEffect(() => {
    if (publicClient === undefined) {
      return;
    }
    const pending = checkableKey.split(",").filter((candidate) => candidate !== "" && !answeredRef.current.has(candidate));
    if (pending.length === 0) {
      return;
    }

    let isCurrent = true;
    void Promise.all(
      pending.map(async (candidate) => {
        const code = await publicClient.getCode({ address: candidate as Address }).catch(() => undefined);
        return [candidate, code === undefined || code === "0x" ? "wallet" : "contract"] as const;
      }),
    ).then((resolved) => {
      if (!isCurrent) {
        return;
      }
      for (const [candidate, kind] of resolved) {
        answeredRef.current.set(candidate, kind);
      }
      setKinds(new Map(answeredRef.current));
    });

    return () => {
      isCurrent = false;
    };
  }, [checkableKey, publicClient]);

  return kinds;
}
