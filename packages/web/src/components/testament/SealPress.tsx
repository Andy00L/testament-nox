"use client";

import { AnimatePresence, motion } from "motion/react";

import { Seal } from "@/components/scene/Seal";
import { useTranslation } from "@/components/i18n/LanguageProvider";

/**
 * The signature. The one moment in this product that spends the motion budget.
 *
 * The stone lands slightly turned and a hair oversized, then settles: the single overshoot
 * this design system allows, spent here and nowhere else. The impression stays on the panel
 * afterwards, because a testament that has been sealed should look sealed.
 *
 * Cinnabar's whole meaning in this palette is "this cannot be undone", so it appears at the
 * moment of commitment and at most once on a screen.
 *
 * What the press has to answer, and previously did not: sealing takes several seconds, and
 * the only feedback was a `group-active` scale that the disabled attribute cancelled the
 * instant the work began. Pressing therefore looked like nothing happening. So the stone now
 * goes down and STAYS down for the whole operation, and the recess fills tonally through the
 * three stages the write already reports (encrypting, signing, confirming). The fill is real
 * information rather than a spinner: it is the same staged progress the label names, in the
 * same tonal-fill-in-a-well language as the heartbeat charge and the allocation meter, so the
 * product keeps one physics and one personality.
 */

type SealPressProps = {
  onPress: () => void;
  isStamped: boolean;
  isBusy: boolean;
  busyLabel: string;
  /** How far through the seal's three stages the write is. Unit: 0 to 1. */
  busyProgress: number;
  disabledReason?: string | null;
};

export function SealPress({
  onPress,
  isStamped,
  isBusy,
  busyLabel,
  busyProgress,
  disabledReason,
}: SealPressProps) {
  const { copy } = useTranslation();
  const isBlocked = disabledReason != null && disabledReason !== "";
  const isDisabled = isBusy || isStamped || isBlocked;
  /**
   * Armed: nothing stands between this form and the registry. The moment this flips true the
   * recess pops once and keeps a bronze ring, because testing filled the whole form and then
   * asked what to do next: a seal that merely stops being grey is a cue nobody receives.
   */
  const isArmed = !isBlocked && !isBusy && !isStamped;

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onPress}
        disabled={isDisabled}
        aria-busy={isBusy}
        className="group flex items-center gap-4 text-left disabled:cursor-not-allowed"
      >
        {/*
          The carved recess the stone is pressed into. It stays a well, because the stone goes
          into it rather than standing on it, and it is the one control in this product that
          keeps its own recess: hovering lifts the stone off the floor of it, pressing puts it
          back down. That is the before and after, in the seal's own physics.

          The awaken classes ride the arming flip itself: adding a class starts its CSS
          animation from the first frame, and dropping it on press clears the way for the next
          arming to pop again. No remount, so the stone and the fill never blink.
        */}
        <span
          aria-hidden="true"
          className={`panel-well relative grid size-16 shrink-0 place-items-center overflow-hidden transition-shadow duration-(--dur-small) ease-(--ease-standard) group-hover:not-disabled:shadow-[inset_0_1px_2px_rgba(58,45,42,0.14),inset_0_0_0_1px_rgba(88,66,60,0.2)] ${
            isArmed ? "seal-armed anim-seal-awaken" : ""
          }`}
        >
          {/*
            The stage fill. Rises through the full track with stable square edges, clamped to
            the well, and is a value step off the field rather than a saturated bar.
          */}
          <span
            className="absolute inset-x-0 bottom-0 bg-bronze-sunk"
            style={{
              height: `${Math.round(Math.min(1, Math.max(0, busyProgress)) * 100)}%`,
              transition: "height var(--duration-medium) var(--ease-smooth-out)",
            }}
          />

          <AnimatePresence>
            {isStamped ? (
              <motion.span
                key="impression"
                initial={{ opacity: 0, scale: 1.16, rotate: -7 }}
                animate={{ opacity: 1, scale: 1, rotate: -2.5 }}
                transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 grid place-items-center"
              >
                <Seal size={46} label={copy.seal.sealed} />
              </motion.span>
            ) : (
              <motion.span
                key="waiting"
                initial={{ opacity: 0 }}
                // The stone holds down for the whole operation rather than rebounding on
                // pointer-up: the press is the state, not the gesture.
                animate={{ opacity: 1, scale: isBusy ? 0.94 : 1 }}
                exit={{ opacity: 0, transition: { duration: 0.16 } }}
                transition={{ duration: 0.24, ease: [0.4, 0, 0.2, 1] }}
                className={`absolute inset-0 grid place-items-center transition-transform duration-(--dur-small) ease-(--ease-standard) group-hover:not-disabled:-translate-y-0.5 group-active:not-disabled:translate-y-px ${
                  isBlocked ? "opacity-60" : ""
                }`}
              >
                {/* Dormant while blocked: a stone at rest, not yet an act on offer. */}
                <Seal size={46} pressed={isBusy ? 0.62 : 0.16} />
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <span className="flex flex-col gap-1">
          {/*
            The stage name changes three times during one press. Announced, because the only
            other reading of it is a 64px recess filling.
          */}
          <span className="type-title text-ink" aria-live="polite">
            {isBusy ? busyLabel : isStamped ? copy.seal.sealed : copy.seal.idle}
          </span>
          <span className="type-small text-ink-muted">
            {isStamped ? copy.seal.sealedLede : copy.seal.idleLede}
          </span>
        </span>
      </button>

      {isBlocked && !isStamped ? (
        <p className="type-small text-ink-faint">{disabledReason}</p>
      ) : null}
      {/* The words for what the pop and the ring just said: the will is ready to be sealed. */}
      {isArmed ? <p className="type-small text-bronze-deep">{copy.seal.readyHint}</p> : null}
    </div>
  );
}
