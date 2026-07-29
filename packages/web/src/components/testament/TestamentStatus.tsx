"use client";

import {
  TESTAMENT_STATE,
  computeSecondsUntilDeadline,
  computeSilenceProgress,
  computeTestamentPhase,
} from "@testament/shared";
import Link from "next/link";
import { useEffect } from "react";

import { HeartbeatControl } from "@/components/testament/HeartbeatControl";
import { useCurtain } from "@/components/scene/CurtainStage";
import { buildAddressUrl, shortenAddress } from "@/lib/chain";
import { formatRemaining, useActiveTestament, useNowSeconds } from "@/lib/testament-read";

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

  const summary = testament.status === "found" ? testament.summary : null;
  const silence =
    summary === null || nowSeconds === null ? 0 : computeSilenceProgress(summary, nowSeconds);
  const isReleased =
    summary !== null &&
    (summary.state === TESTAMENT_STATE.Released || summary.state === TESTAMENT_STATE.Executed);

  // External system: the canvas scene, which lives outside React and has to be told.
  useEffect(() => {
    setMood({ silence, isReleased });
  }, [silence, isReleased, setMood]);

  if (testament.status === "not-deployed") {
    // One quiet sentence. The missing variable names belong in the console, not in a
    // sentence a visitor has to read past.
    return <p className="type-small text-ink-faint">Contrats non déployés sur ce réseau.</p>;
  }

  if (testament.status === "disconnected" || testament.status === "none") {
    return null;
  }

  if (testament.status === "loading" || summary === null || nowSeconds === null) {
    return <p className="type-small text-ink-faint">Lecture de la chaîne…</p>;
  }

  const phase = computeTestamentPhase(summary, nowSeconds);
  const secondsLeft = computeSecondsUntilDeadline(summary, nowSeconds);

  if (summary.state === TESTAMENT_STATE.Released) {
    return (
      <div className="flex flex-col gap-3">
        <p className="type-body text-ink">
          Le vent est tombé. Le testament est ouvert et attend son exécution.
        </p>
        <Link
          href="/porte"
          className="type-small text-ink-muted underline-offset-4 transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
        >
          Aller à la porte
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="type-body text-ink-muted">
        <span className="text-ink">
          {phase === "expired"
            ? "Le vent est tombé."
            : `Le vent tombe dans ${formatRemaining(secondsLeft)}.`}
        </span>{" "}
        Le Safe{" "}
        <a
          href={buildAddressUrl(summary.safe)}
          target="_blank"
          rel="noreferrer"
          className="type-numeric transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
        >
          {shortenAddress(summary.safe)}
        </a>{" "}
        paiera vos héritiers si le silence dure.
      </p>

      <HeartbeatControl testamentId={testament.testamentId} />
    </div>
  );
}
