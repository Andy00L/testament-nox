"use client";

import { AnimatePresence, motion } from "motion/react";

import { Seal } from "@/components/scene/Seal";

/**
 * The signature. The one moment in this product that spends the motion budget.
 *
 * The stone lands slightly turned and a hair oversized, then settles: the single overshoot
 * this design system allows, spent here and nowhere else. The impression stays on the panel
 * afterwards, because a testament that has been sealed should look sealed.
 *
 * Cinnabar's whole meaning in this palette is "this cannot be undone", so it appears at the
 * moment of commitment and at most once on a screen.
 */

type SealPressProps = {
  onPress: () => void;
  isStamped: boolean;
  isBusy: boolean;
  busyLabel: string;
  disabledReason?: string | null;
};

export function SealPress({ onPress, isStamped, isBusy, busyLabel, disabledReason }: SealPressProps) {
  const isDisabled = isBusy || isStamped || (disabledReason != null && disabledReason !== "");

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onPress}
        disabled={isDisabled}
        className="group flex items-center gap-4 text-left disabled:cursor-not-allowed"
      >
        {/* The carved recess the stone is pressed into. */}
        <span
          aria-hidden="true"
          className="lacquer-well relative grid size-16 shrink-0 place-items-center transition-transform duration-(--dur-micro) ease-(--ease-standard) group-active:not-disabled:scale-[0.98]"
        >
          <AnimatePresence>
            {isStamped ? (
              <motion.span
                key="impression"
                initial={{ opacity: 0, scale: 1.16, rotate: -7 }}
                animate={{ opacity: 1, scale: 1, rotate: -2.5 }}
                transition={{ duration: 0.38, ease: [0.16, 1, 0.3, 1] }}
                className="absolute inset-0 grid place-items-center"
              >
                <Seal size={46} />
              </motion.span>
            ) : (
              <motion.span
                key="waiting"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.16 } }}
                className="absolute inset-0 grid place-items-center"
              >
                <Seal size={46} pressed={0.16} />
              </motion.span>
            )}
          </AnimatePresence>
        </span>

        <span className="flex flex-col gap-1">
          <span className="type-title text-ink">
            {isBusy ? busyLabel : isStamped ? "Testament scellé" : "Presser le sceau"}
          </span>
          <span className="type-small text-ink-muted">
            {isStamped
              ? "Les héritiers et les parts sont chiffrés on-chain."
              : "Chiffre le testament et l'inscrit dans le registre. Irréversible."}
          </span>
        </span>
      </button>

      {disabledReason != null && disabledReason !== "" && !isStamped ? (
        <p className="type-small text-ink-faint">{disabledReason}</p>
      ) : null}
    </div>
  );
}
