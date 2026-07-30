"use client";

import { testamentRegistryAbi } from "@testament/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { useWaitForTransactionReceipt, useWriteContract } from "wagmi";

import { Key } from "@/components/ui/Key";
import { useCurtain } from "@/components/scene/CurtainStage";
import { readDeployment } from "@/lib/chain";
import { useTranslation } from "@/components/i18n/LanguageProvider";
import type { Copy } from "@/lib/i18n";
import { describeThrown, isUserRejection } from "@/lib/testament-write";

/**
 * The heartbeat, sent by holding rather than clicking.
 *
 * Holding builds a wind: the curtain leans further the longer you hold, so the scene is
 * the charge meter. Let go at full charge and the gust sweeps the curtain while the
 * transaction goes out. The control itself fills tonally as a second, non-visual-only
 * reading of the same state, because nobody should have to watch a canvas to know whether
 * a press registered.
 */

/** How long the control must be held before the heartbeat is sent. Unit: milliseconds. */
const HOLD_DURATION_MS = 900;

type HeartbeatControlProps = {
  testamentId: bigint;
  onSent?: () => void;
};

export function HeartbeatControl({ testamentId, onSent }: HeartbeatControlProps) {
  const deployment = readDeployment();
  const { setCharge, sendGust } = useCurtain();
  const { copy } = useTranslation();
  const [chargeProgress, setChargeProgress] = useState(0);
  const [isHolding, setIsHolding] = useState(false);
  const holdStartedAtRef = useRef<number | null>(null);

  const {
    writeContract,
    data: transactionHash,
    isPending,
    reset,
    error: heartbeatError,
  } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({
    hash: transactionHash,
  });

  const sendHeartbeat = useCallback(() => {
    if (!deployment.isDeployed) {
      return;
    }
    sendGust();
    writeContract({
      address: deployment.addresses.registry,
      abi: testamentRegistryAbi,
      functionName: "heartbeat",
      args: [testamentId],
    });
  }, [deployment, sendGust, testamentId, writeContract]);

  // External system: requestAnimationFrame, driving the hold meter and the curtain's lean
  // while the control is held.
  useEffect(() => {
    if (!isHolding) {
      setCharge(0);
      return;
    }

    holdStartedAtRef.current = performance.now();
    let animationFrame = 0;

    const tick = () => {
      const startedAt = holdStartedAtRef.current;
      if (startedAt === null) {
        return;
      }
      const progress = Math.min(1, (performance.now() - startedAt) / HOLD_DURATION_MS);
      setChargeProgress(progress);
      setCharge(progress);

      if (progress >= 1) {
        setIsHolding(false);
        setChargeProgress(0);
        sendHeartbeat();
        return;
      }
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      setCharge(0);
    };
  }, [isHolding, sendHeartbeat, setCharge]);

  // External system: the transaction receipt. A confirmed heartbeat means the chain data
  // upstream is stale.
  useEffect(() => {
    if (isSuccess) {
      onSent?.();
      reset();
    }
  }, [isSuccess, onSent, reset]);

  const startHold = () => {
    if (isPending || isConfirming) {
      return;
    }
    setIsHolding(true);
  };

  const cancelHold = () => {
    setIsHolding(false);
    setChargeProgress(0);
  };

  const label = resolveLabel({ isPending, isConfirming, isHolding, copy });

  return (
    <div className="flex flex-col gap-2">
      <Key
        disabled={isPending || isConfirming || !deployment.isDeployed}
        // The one thing this page exists for, so it is the page's one beckoning act.
        beckons={!isPending && !isConfirming && deployment.isDeployed}
        onPointerDown={startHold}
        onPointerUp={cancelHold}
        onPointerLeave={cancelHold}
        onPointerCancel={cancelHold}
        onKeyDown={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault();
            startHold();
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") {
            cancelHold();
          }
        }}
        aria-describedby="heartbeat-hint"
        // The one thing on this page that has to be done, at the size that says so. It was a
        // 44px well set in the same small type as the hint underneath it, and it read as a
        // caption. Presence here is size and space, not a second colour. It is a key, so it
        // stands proud until it is held and then stays flush for as long as the hold lasts.
        className="relative min-h-14 w-full max-w-sm touch-none px-7 py-4 text-left"
      >
        {/*
          A tonal fill rising through the key. It fills the full track, has stable square
          edges at both ends, and is a value step off the field rather than a saturated bar.
          The chamfer lives on the full-bleed carrier, not on the fill itself: an ancestor's
          clip stands still while the fill rises, so the travelling top edge stays square and
          only the key's own corners are ever cut.
        */}
        <span aria-hidden="true" className="key-inlay pointer-events-none absolute inset-0">
          <span
            className="absolute inset-x-0 bottom-0 bg-bronze-sunk"
            style={{
              height: `${chargeProgress * 100}%`,
              transition: isHolding ? "none" : "height var(--dur-standard) var(--ease-exit)",
            }}
          />
        </span>
        <span className="type-title relative">{label}</span>
      </Key>
      <p id="heartbeat-hint" className="type-small text-ink-faint">
        {copy.heartbeat.hint}
      </p>
      {/*
        A heartbeat that failed used to fail in silence: the label snapped back to idle and
        the owner had no way to know their sign of life never left. Declining in the wallet
        and a broken send are different facts, and both are said out loud.
      */}
      {heartbeatError != null ? (
        <p role="alert" className="anim-shake type-small text-cinnabar">
          {isUserRejection(heartbeatError)
            ? copy.errors.declinedInWallet
            : describeThrown(heartbeatError)}
        </p>
      ) : null}
    </div>
  );
}

function resolveLabel({
  isPending,
  isConfirming,
  isHolding,
  copy,
}: {
  isPending: boolean;
  isConfirming: boolean;
  isHolding: boolean;
  copy: Copy;
}): string {
  if (isPending) {
    return copy.heartbeat.signing;
  }
  if (isConfirming) {
    return copy.heartbeat.confirming;
  }
  if (isHolding) {
    return copy.heartbeat.holding;
  }
  return copy.heartbeat.idle;
}
