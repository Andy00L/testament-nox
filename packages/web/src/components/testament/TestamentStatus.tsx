"use client";

import {
  TESTAMENT_STATE,
  computeSecondsUntilDeadline,
  computeSilenceProgress,
  computeTestamentPhase,
} from "@testament/shared";
import Link from "next/link";
import { useEffect } from "react";

import { FramedCountdown } from "@/components/frames/FramedCountdown";
import { DoorLinkField } from "@/components/testament/DoorLinkField";
import { HeartbeatControl } from "@/components/testament/HeartbeatControl";
import { useCurtain } from "@/components/scene/CurtainStage";
import { useTranslation } from "@/components/i18n/LanguageProvider";
import { buildAddressUrl, shortenAddress } from "@/lib/chain";
import { formatRemaining } from "@/lib/i18n";
import { useActiveTestament, useNowSeconds } from "@/lib/testament-read";

/** Largest width the zodiac dial is laid out at on the home scene. Unit: CSS px. */
const DIAL_MAX_WIDTH = 460;

/**
 * What the scene is currently saying, in one line of prose, plus the heartbeat.
 *
 * This block also drives the curtain: it is the single place that translates a testament's
 * silence into the scene's mood, so the artifact and the copy can never disagree.
 */
export function TestamentStatus() {
  const testament = useActiveTestament();
  const nowSeconds = useNowSeconds();
  const { setMood } = useCurtain();
  const { copy } = useTranslation();

  const summary = testament.status === "found" ? testament.summary : null;
  const testamentId = testament.status === "found" ? testament.testamentId : null;
  const silence =
    summary === null || nowSeconds === null ? 0 : computeSilenceProgress(summary, nowSeconds);
  const isReleased =
    summary !== null &&
    (summary.state === TESTAMENT_STATE.Released ||
      summary.state === TESTAMENT_STATE.PartiallyExecuted ||
      summary.state === TESTAMENT_STATE.Executed);

  // External system: the canvas scene, which lives outside React and has to be told.
  useEffect(() => {
    setMood({ silence, isReleased });
  }, [silence, isReleased, setMood]);

  if (testament.status === "not-deployed") {
    // One quiet sentence. The missing variable names belong in the console, not in a
    // sentence a visitor has to read past.
    return <p className="type-small text-ink-faint">{copy.status.notDeployed}</p>;
  }

  if (testament.status === "disconnected" || testament.status === "none") {
    return null;
  }

  if (testament.status === "loading" || summary === null || nowSeconds === null) {
    return <p className="type-small text-ink-faint">{copy.status.reading}</p>;
  }

  const phase = computeTestamentPhase(summary, nowSeconds);
  const secondsLeft = computeSecondsUntilDeadline(summary, nowSeconds);

  if (summary.state === TESTAMENT_STATE.Released) {
    return (
      <div className="flex flex-col gap-3">
        <p className="type-body text-ink">{copy.status.releasedLede}</p>
        <Link
          href={testamentId === null ? "/porte" : `/porte?id=${testamentId}`}
          className="type-small text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
        >
          {copy.status.goToDoor}
        </Link>
      </div>
    );
  }

  const sentence = copy.status.safeWillPay(shortenAddress(summary.safe));

  return (
    <div className="flex flex-col gap-6">
      {/*
        The dial carries the countdown now. It used to be the opening clause of a muted
        sentence, which is a fine place to put a figure nobody has to act on and the wrong
        place for the one number this whole page exists to keep from reaching zero.
      */}
      <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-7">
        <FramedCountdown
          frame="hourglass"
          maxWidth={DIAL_MAX_WIDTH}
          className="shrink-0"
          isExpired={phase === "expired"}
          remaining={formatRemaining(secondsLeft, copy.duration)}
          expiredLabel={copy.status.windFell}
          label={copy.status.countdownLabel}
        />

        <p className="type-body text-ink-muted">
          {sentence.before}
          <a
            href={buildAddressUrl(summary.safe)}
            target="_blank"
            rel="noreferrer"
            className="type-numeric transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
          >
            {sentence.link}
          </a>
          {sentence.after}
        </p>
      </div>

      <HeartbeatControl testamentId={testament.testamentId} onSent={testament.refetch} />

      {/*
        The link an heir will need one day is shared while its author is alive, so it is the
        one thing on this page you take away with you. It was a faint text link and it was
        missed; it is now a control you can hit anywhere and that says it worked.
      */}
      {testamentId !== null ? <DoorLinkField testamentId={testamentId} /> : null}
    </div>
  );
}
