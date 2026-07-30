"use client";

import { Check } from "@appica/icons-react";

/**
 * A pair of ordered acts, both visible at once.
 *
 * Both places that use it have exactly two acts in a fixed order. On the write sheet those
 * are the Safe's consents, the passage then the hand. On the door they are opening the will
 * and then settling it. What this replaces is a single button that appeared, changed its
 * label, and disappeared: correct, and unreadable. Nothing said there were two acts, which
 * one you were on, or that anything remained after the first. A tester working from a written
 * guide still lost the thread.
 *
 * So both acts are always on screen, numbered, and only the one whose turn it is can be
 * pressed. The done state is the same tonal bronze the rest of the product confirms with; the
 * unreached state names itself in faint ink and offers nothing, because offering an action the
 * chain would refuse is worse than showing none.
 *
 * The material carries that distinction rather than the copy. The step whose turn it is stands
 * proud of the panel as a key and presses flush; the steps that are done or not yet reachable
 * are sunk wells, which is what they are. Testing read the previous version, where all four
 * states were the same recess, as four inert grey boxes.
 */

/**
 * What a step can be. `unreached` is a step whose turn has not come, or whose prerequisite has
 * not been read from the chain yet.
 */
export type StepState = "unreached" | "ready" | "running" | "done";

export type TrackStep = {
  state: StepState;
  label: string;
  runningLabel: string;
  doneLabel: string;
  onRun: () => void;
};

type StepTrackProps = {
  first: TrackStep;
  second: TrackStep;
  /** Names the pair for assistive technology. */
  title: string;
};

export function StepTrack({ first, second, title }: StepTrackProps) {
  return (
    <section aria-label={title} className="flex flex-col gap-2 sm:flex-row">
      <TrackStepCell step={first} ordinal={1} />
      <TrackStepCell step={second} ordinal={2} />
    </section>
  );
}

function TrackStepCell({ step, ordinal }: { step: TrackStep; ordinal: number }) {
  // The ordinal is what makes the pair read as a sequence rather than two loose buttons, so
  // it is rendered even in the states that carry no action.
  const ordinalMark = (
    <span aria-hidden="true" className="type-numeric shrink-0 text-ink-faint">
      {ordinal}
    </span>
  );

  if (step.state === "done") {
    return (
      <p className="panel-well type-small flex min-h-11 flex-1 items-center gap-2.5 px-4 py-3 text-bronze-deep">
        {ordinalMark}
        <Check size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
        {step.doneLabel}
      </p>
    );
  }

  if (step.state === "unreached") {
    return (
      <p className="panel-well type-small flex min-h-11 flex-1 items-center gap-2.5 px-4 py-3 text-ink-faint">
        {ordinalMark}
        {step.label}
      </p>
    );
  }

  const isRunning = step.state === "running";

  return (
    <button
      type="button"
      onClick={step.onRun}
      disabled={isRunning}
      aria-busy={isRunning}
      className="key type-small flex min-h-11 flex-1 items-center gap-2.5 px-4 py-3 text-left"
    >
      {ordinalMark}
      {isRunning ? step.runningLabel : step.label}
    </button>
  );
}
