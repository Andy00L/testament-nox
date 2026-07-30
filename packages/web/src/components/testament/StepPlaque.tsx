"use client";

import { Check } from "@appica/icons-react";

import { CarvedFrame } from "@/components/frames/CarvedFrame";

/**
 * A pair of ordered steps, mounted as the two slots of the legacy plaque.
 *
 * The mapping is not decoration: the plaque is carved with exactly two windows, and both
 * places that use it have exactly two acts in a fixed order. On the write sheet those are the
 * Safe's consents, the passage then the hand. On the door they are opening the will and then
 * settling it. Slot one is always the earlier act, so its state is legible at a glance
 * without reading a hint.
 *
 * This replaces two separate single buttons that appeared, changed label, and disappeared.
 * They were correct and unreadable: nothing on either page said there were two acts, which
 * one you were on, or that anything remained after the first. A tester working from a written
 * guide still lost the thread. Two carved windows say it before a word is read.
 */

/**
 * What a step can be. `unreached` is a step whose turn has not come, or whose prerequisite
 * has not been read from the chain yet: it names itself and offers nothing.
 */
export type StepState = "unreached" | "ready" | "running" | "done";

export type PlaqueStep = {
  state: StepState;
  label: string;
  runningLabel: string;
  doneLabel: string;
  onRun: () => void;
};

type StepPlaqueProps = {
  first: PlaqueStep;
  second: PlaqueStep;
  /** Names the plaque for assistive technology; the artwork carries no text of use. */
  title: string;
  /**
   * Which axis the plaque sits on. It has to share one with whatever it is grouped against,
   * so a page never reads as two clusters that agreed on nothing.
   */
  align?: "start" | "center";
};

/**
 * Largest width the plaque is laid out at. Chosen so its slots clear 44px of touch target at
 * the frame's measured slot height (18.98% of a 2.8704 ratio box). Unit: CSS px.
 */
const PLAQUE_MAX_WIDTH = 720;

/** One type size for every slot, against the plaque rather than the viewport. Unit: cqw. */
const SLOT_TYPE_SIZE = "2.1cqw";

export function StepPlaque({ first, second, title, align = "center" }: StepPlaqueProps) {
  return (
    <section
      aria-label={title}
      className={`flex w-full ${align === "center" ? "justify-center" : "justify-start"}`}
    >
      <CarvedFrame frame="legacyBox" maxWidth={PLAQUE_MAX_WIDTH}>
        {[<PlaqueSlot key="first" step={first} />, <PlaqueSlot key="second" step={second} />]}
      </CarvedFrame>
    </section>
  );
}

function PlaqueSlot({ step }: { step: PlaqueStep }) {
  if (step.state === "done") {
    return (
      <p className="type-numeric flex items-center justify-center gap-2 text-bronze-deep">
        <Check size={14} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
        <span style={{ fontSize: SLOT_TYPE_SIZE, letterSpacing: "0.01em" }}>{step.doneLabel}</span>
      </p>
    );
  }

  if (step.state === "unreached") {
    return (
      <p
        className="type-numeric text-center text-ink-faint"
        style={{ fontSize: SLOT_TYPE_SIZE, letterSpacing: "0.01em" }}
      >
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
      // The hit area is allowed past the window's short edge: the window draws the control,
      // the target is what a thumb needs. Nothing visible crosses the gold lip.
      className="grid h-full min-h-11 w-full place-items-center text-ink transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-bronze-deep disabled:text-ink-faint"
    >
      <span
        className="type-numeric text-center"
        style={{ fontSize: SLOT_TYPE_SIZE, letterSpacing: "0.01em" }}
      >
        {isRunning ? step.runningLabel : step.label}
      </span>
    </button>
  );
}
