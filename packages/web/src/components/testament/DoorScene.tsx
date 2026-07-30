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

import { FramedCountdown } from "@/components/frames/FramedCountdown";
import { HeirEnvelope } from "@/components/testament/HeirEnvelope";
import { StepPlaque, type StepState } from "@/components/testament/StepPlaque";
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

/** Largest width the fan is laid out at. Unit: CSS px. */
const FAN_MAX_WIDTH = 440;

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
        {/*
          The public countdown, on the fan. It is the only thing this page can honestly show
          an heir before the wind falls, so it is the object on the page rather than a grey
          line under the prose.
        */}
        <FramedCountdown
          frame="fan"
          maxWidth={FAN_MAX_WIDTH}
          isExpired={false}
          remaining={
            nowSeconds === null ? null : formatRemaining(deadline - nowSeconds, copy.duration)
          }
          expiredLabel={copy.door.expiredTitle}
          label={copy.door.countdownLabel}
        />
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
        <StepPlaque
          title={copy.door.openedTitle}
          align="start"
          first={{
            state: isWorking ? "running" : "ready",
            label: copy.door.openIt,
            runningLabel: copy.door.opening,
            doneLabel: copy.door.stepOpenDone,
            onRun: () => void runRelease(),
          }}
          second={{
            state: "unreached",
            label: copy.door.execute,
            runningLabel: copy.door.executing,
            doneLabel: copy.door.stepPayDone,
            onRun: () => undefined,
          }}
        />
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
  const paidCount = will === null ? 0 : will.filter((bequest) => (paidMask & (1 << bequest.slot)) !== 0).length;

  /**
   * Settling is the plaque's second act. Once it has run at all the act is done, even if an
   * heir refused: the money that did not land is chased per heir on its own envelope, and the
   * line under the plaque says how many were reached.
   */
  const payState: StepState = hasBeenExecuted ? "done" : isWorking ? "running" : "ready";

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
        <ol className="flex w-full flex-col items-start">
          {will.map((bequest, bequestIndex) => {
            const isVisitor =
              address !== undefined && bequest.beneficiary.toLowerCase() === address.toLowerCase();
            const isPaid = (paidMask & (1 << bequest.slot)) !== 0;
            return (
              <HeirEnvelope
                key={bequest.beneficiary}
                index={bequestIndex}
                isTop={bequestIndex === will.length - 1}
                addressLine={
                  <a
                    href={buildAddressUrl(bequest.beneficiary)}
                    target="_blank"
                    rel="noreferrer"
                    className={`type-numeric truncate transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-bronze-deep ${
                      isVisitor ? "text-bronze-deep" : "text-ink"
                    }`}
                  >
                    {shortenAddress(bequest.beneficiary)}
                    {isVisitor ? copy.door.you : ""}
                  </a>
                }
                amountLine={
                  <span className="type-numeric text-ink-muted">
                    {bequest.shareBps / 100} %
                    {estateWei > 0n
                      ? ` · ${formatEther(computePayout(estateWei, bequest.shareBps))} ETH`
                      : ""}
                  </span>
                }
                settlement={
                  !hasBeenExecuted ? null : isPaid ? (
                    <span className="text-bronze-deep">{copy.door.heirPaid}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void runRetry(bequest.slot)}
                      disabled={isWorking}
                      className="text-cinnabar transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink disabled:text-ink-faint"
                    >
                      {isWorking ? copy.door.heirRetrying : copy.door.heirRetry}
                    </button>
                  )
                }
              />
            );
          })}
        </ol>
      )}

      {visitorShare !== null && !hasBeenExecuted ? (
        <p className="type-body text-ink">
{copy.door.yourShare(visitorShare.shareBps / 100)}
        </p>
      ) : null}

      <StepPlaque
        title={copy.door.openedTitle}
        align="start"
        first={{
          state: "done",
          label: copy.door.openIt,
          runningLabel: copy.door.opening,
          doneLabel: copy.door.stepOpenDone,
          onRun: () => undefined,
        }}
        second={{
          state: payState,
          label: copy.door.execute,
          runningLabel: copy.door.executing,
          doneLabel: copy.door.stepPayDone,
          onRun: () => void runExecute(),
        }}
      />

      {isPartlySettled ? (
        <p className="type-body text-ink">{copy.door.partiallyPaid(paidCount, will?.length ?? 0)}</p>
      ) : null}

      <Feedback errorMessage={errorMessage} transactionHash={actionTransaction} feedbackCopy={copy.door} />
    </div>
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
