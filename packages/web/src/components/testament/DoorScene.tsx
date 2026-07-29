"use client";

import { ExternalLink } from "@appica/icons-react";
import {
  TESTAMENT_STATE,
  computeDeadline,
  computePayout,
  testamentRegistryAbi,
} from "@testament/shared";
import type { Copy } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract, useWalletClient } from "wagmi";

import { useCurtain } from "@/components/scene/CurtainStage";
import { useTranslation } from "@/components/i18n/LanguageProvider";
import { describeWriteFailure } from "@/lib/describe-failure";
import { buildAddressUrl, buildTransactionUrl, readDeployment, shortenAddress } from "@/lib/chain";
import { formatRemaining } from "@/lib/i18n";
import { useNowSeconds, useTestamentById } from "@/lib/testament-read";
import {
  executeTestament,
  readReleasedWill,
  releaseTestament,
  retryHeirPayment,
  type ReleasedBequest,
} from "@/lib/testament-write";

/**
 * The door.
 *
 * Before release every visitor sees exactly the same sentence. Not "you are not a
 * beneficiary", not "you are one of three": the page cannot tell, and more importantly it
 * must not appear to tell, because a page that reacts differently to different wallets is a
 * lookup oracle for the very thing the encryption is protecting.
 *
 * Once released the will is public by design, so the page reads it in clear and shows the
 * visitor their line if there is one.
 *
 * Without an `?id=` there is nothing to look up on purpose: an heir arrives through the
 * link the author shared, and defaulting to "the most recent testament on the registry"
 * would put a stranger's affairs on the doorstep.
 */
export function DoorScene({ requestedId }: { requestedId?: bigint }) {
  const deployment = readDeployment();
  const testamentId = requestedId;

  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient();
  const nowSeconds = useNowSeconds();
  const { setMood } = useCurtain();
  const { copy } = useTranslation();

  const { summary, slotHandles, isPending, refetch } = useTestamentById(testamentId);
  const estate = useBalance({ address: summary?.safe });

  const [will, setWill] = useState<ReleasedBequest[] | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionTransaction, setActionTransaction] = useState<string | null>(null);

  // Once a will is open it stays open, whether it has finished paying or not.
  const isReleased =
    summary !== undefined &&
    (summary.state === TESTAMENT_STATE.Released ||
      summary.state === TESTAMENT_STATE.PartiallyExecuted ||
      summary.state === TESTAMENT_STATE.Executed);

  // Which heirs the estate has actually reached. Bit `i` is slot `i`.
  const paidSlotsQuery = useReadContract({
    address: deployment.isDeployed ? deployment.addresses.registry : undefined,
    abi: testamentRegistryAbi,
    functionName: "paidSlots",
    args: testamentId === undefined ? undefined : [testamentId],
    query: { enabled: deployment.isDeployed && testamentId !== undefined },
  });
  const paidMask = typeof paidSlotsQuery.data === "number" ? paidSlotsQuery.data : 0;

  // External system: the canvas. The curtain falling is the door opening; there is no
  // second illustration of a door anywhere in this product.
  useEffect(() => {
    setMood({ silence: isReleased ? 1 : 0.55, isReleased });
  }, [isReleased, setMood]);

  // External system: the Handle Gateway. Once a will is public, its plaintext is fetched
  // over the network, which React does not own.
  useEffect(() => {
    if (!isReleased || slotHandles === undefined || will !== null) {
      return;
    }
    let isCurrent = true;
    void readReleasedWill({ slotHandles }).then((result) => {
      if (!isCurrent) {
        return;
      }
      if (result.ok) {
        setWill(result.value);
      } else {
        setErrorMessage(describeWriteFailure(result.failure, copy));
      }
    });
    return () => {
      isCurrent = false;
    };
    // `copy` is a dependency because a failure is rendered in the reader's language: switching
    // language while an error is showing re-reads it and retranslates. Once the will has
    // loaded the guard above makes the rerun free.
  }, [isReleased, slotHandles, will, copy]);

  if (!deployment.isDeployed) {
    return <p className="type-body text-ink-faint">{copy.door.notConfigured}</p>;
  }

  // No link, no lookup: the explanation is the whole page.
  if (testamentId === undefined) {
    return (
      <div key="no-link" className="anim-rise flex flex-col gap-6">
        <h1 className="type-display-hero">{copy.door.noLinkTitle}</h1>
        <p className="type-body text-ink-muted">{copy.door.noLinkLede}</p>
        <p className="type-small text-ink-faint">{copy.door.noLinkHint}</p>
      </div>
    );
  }

  if (isPending || summary === undefined) {
    return <p className="type-body text-ink-faint">{copy.door.reading}</p>;
  }

  if (summary.state === TESTAMENT_STATE.None) {
    return <p className="type-body text-ink-muted">{copy.door.none}</p>;
  }

  if (summary.state === TESTAMENT_STATE.Revoked) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="type-display-hero">{copy.door.revokedTitle}</h1>
        <p className="type-body text-ink-muted">
{copy.door.revokedLede}
        </p>
      </div>
    );
  }

  const deadline = computeDeadline(summary);
  const isExpired = nowSeconds !== null && nowSeconds > deadline;

  const runRelease = async () => {
    if (walletClient === undefined || publicClient === undefined) {
      setErrorMessage(copy.door.connectToOpen);
      return;
    }
    setIsWorking(true);
    setErrorMessage(null);
    const result = await releaseTestament({
      walletClient,
      publicClient,
      registryAddress: deployment.addresses.registry,
      testamentId,
    });
    setIsWorking(false);
    if (result.ok) {
      setActionTransaction(result.value);
      refetch();
    } else {
      setErrorMessage(describeWriteFailure(result.failure, copy));
    }
  };

  const runRetry = async (slot: number) => {
    if (walletClient === undefined || publicClient === undefined) {
      setErrorMessage(copy.door.connectToExecute);
      return;
    }
    setIsWorking(true);
    setErrorMessage(null);
    const result = await retryHeirPayment({
      walletClient,
      publicClient,
      registryAddress: deployment.addresses.registry,
      testamentId,
      slot,
    });
    setIsWorking(false);
    if (result.ok) {
      setActionTransaction(result.value);
      refetch();
      void paidSlotsQuery.refetch();
    } else {
      setErrorMessage(describeWriteFailure(result.failure, copy));
    }
  };

  const runExecute = async () => {
    if (walletClient === undefined || publicClient === undefined || slotHandles === undefined) {
      setErrorMessage(copy.door.connectToExecute);
      return;
    }
    setIsWorking(true);
    setErrorMessage(null);
    const result = await executeTestament({
      walletClient,
      publicClient,
      registryAddress: deployment.addresses.registry,
      testamentId,
      slotHandles,
    });
    setIsWorking(false);
    if (result.ok) {
      setActionTransaction(result.value);
      refetch();
    } else {
      setErrorMessage(describeWriteFailure(result.failure, copy));
    }
  };

  // ---- Closed. The same words for every visitor, connected or not. ----
  if (summary.state === TESTAMENT_STATE.Active && !isExpired) {
    return (
      <div key="closed" className="anim-rise flex flex-col gap-6">
        <h1 className="type-display-hero">{copy.door.closedTitle}</h1>
        <p className="type-body text-ink-muted">{copy.door.closedLede}</p>
        <p className="type-small text-ink-faint">
          {nowSeconds === null
            ? " "
            : copy.door.windFallsIn(formatRemaining(deadline - nowSeconds, copy.duration))}
        </p>
      </div>
    );
  }

  // ---- Expired, still closed. Anyone may push it open. ----
  if (summary.state === TESTAMENT_STATE.Active && isExpired) {
    return (
      <div key="expired" className="anim-rise flex flex-col gap-6">
        <h1 className="type-display-hero">{copy.door.expiredTitle}</h1>
        <p className="type-body text-ink-muted">
{copy.door.expiredLede}
        </p>
        <ActionButton onPress={() => void runRelease()} isWorking={isWorking} label={copy.door.openIt} workingLabel={copy.door.opening} />
        <Feedback errorMessage={errorMessage} transactionHash={actionTransaction} feedbackCopy={copy.door} />
      </div>
    );
  }

  // ---- Open. The will is public now, by design. ----
  const visitorShare =
    will === null || address === undefined
      ? null
      : (will.find((bequest) => bequest.beneficiary.toLowerCase() === address.toLowerCase()) ?? null);
  const estateWei = estate.data?.value ?? 0n;
  const isSettled = summary.state === TESTAMENT_STATE.Executed;
  const isPartlySettled = summary.state === TESTAMENT_STATE.PartiallyExecuted;
  const hasBeenExecuted = isSettled || isPartlySettled;
  const paidCount = will === null ? 0 : will.filter((b) => (paidMask & (1 << b.slot)) !== 0).length;

  return (
    <div key="open" className="anim-rise flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <h1 className="type-display-hero">{isSettled ? copy.door.openedTitle : copy.door.openingTitle}</h1>
        <p className="type-body text-ink-muted">
{copy.door.openedLede}
        </p>
      </div>

      {will === null ? (
        <p className="type-small text-ink-faint">{copy.door.decrypting}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {will.map((bequest, bequestIndex) => {
            const isVisitor =
              address !== undefined && bequest.beneficiary.toLowerCase() === address.toLowerCase();
            return (
              <li
                key={bequest.beneficiary}
                className="anim-rise panel-well flex flex-wrap items-baseline justify-between gap-3 px-4 py-3"
                style={{ "--anim-delay": `${80 * bequestIndex}ms` } as React.CSSProperties}
              >
                <a
                  href={buildAddressUrl(bequest.beneficiary)}
                  target="_blank"
                  rel="noreferrer"
                  className={`type-small type-numeric transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink ${
                    isVisitor ? "text-bronze" : "text-ink-muted"
                  }`}
                >
                  {shortenAddress(bequest.beneficiary)}
                  {isVisitor ? copy.door.you : ""}
                </a>
                <span className="flex items-baseline gap-3">
                  <span className="type-small type-numeric text-ink">
                    {bequest.shareBps / 100} %
                    {estateWei > 0n
                      ? ` · ${formatEther(computePayout(estateWei, bequest.shareBps))} ETH`
                      : ""}
                  </span>
                  {/*
                    Settlement is per heir, so the door says so per heir. An heir whose wallet
                    refused the transfer is owed, not forgotten: the money is still in the Safe
                    and anyone at all can push it again.
                  */}
                  {hasBeenExecuted ? (
                    (paidMask & (1 << bequest.slot)) !== 0 ? (
                      <span className="type-small text-bronze-deep">{copy.door.heirPaid}</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void runRetry(bequest.slot)}
                        disabled={isWorking}
                        className="type-small text-cinnabar transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink disabled:text-ink-faint"
                      >
                        {isWorking ? copy.door.heirRetrying : copy.door.heirRetry}
                      </button>
                    )
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {visitorShare !== null && !hasBeenExecuted ? (
        <p className="type-body text-ink">
{copy.door.yourShare(visitorShare.shareBps / 100)}
        </p>
      ) : null}

      {!hasBeenExecuted ? (
        <ActionButton
          onPress={() => void runExecute()}
          isWorking={isWorking}
          label={copy.door.execute}
          workingLabel={copy.door.executing}
        />
      ) : isPartlySettled ? (
        <p className="type-body text-ink">
          {copy.door.partiallyPaid(paidCount, will?.length ?? 0)}
        </p>
      ) : (
        <p className="type-body text-bronze">{copy.door.paid}</p>
      )}

      <Feedback errorMessage={errorMessage} transactionHash={actionTransaction} feedbackCopy={copy.door} />
    </div>
  );
}

function ActionButton({
  onPress,
  isWorking,
  label,
  workingLabel,
}: {
  onPress: () => void;
  isWorking: boolean;
  label: string;
  workingLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={isWorking}
      className="panel-well type-small min-h-11 w-fit px-5 py-3 text-ink transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-bronze disabled:text-ink-faint"
    >
      {isWorking ? workingLabel : label}
    </button>
  );
}

function Feedback({
  errorMessage,
  transactionHash,
  feedbackCopy,
}: {
  errorMessage: string | null;
  transactionHash: string | null;
  feedbackCopy: Copy["door"];
}) {
  return (
    <div className="flex flex-col gap-2">
      {errorMessage !== null ? (
        <p role="alert" className="type-small text-cinnabar">
          {errorMessage}
        </p>
      ) : null}
      {transactionHash !== null ? (
        <a
          href={buildTransactionUrl(transactionHash)}
          target="_blank"
          rel="noreferrer"
          className="type-small type-numeric group/tx inline-flex items-center gap-1.5 text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
        >
          {feedbackCopy.viewTransaction}
          <ExternalLink
            size={13}
            strokeWidth={1.5}
            className="transition-transform duration-(--duration-fast) ease-(--ease-smooth-out) group-hover/tx:-translate-y-0.5 group-hover/tx:translate-x-0.5"
          />
        </a>
      ) : null}
    </div>
  );
}
