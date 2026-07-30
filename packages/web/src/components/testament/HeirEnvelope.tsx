"use client";

import type { ReactNode } from "react";

import { CarvedFrame } from "@/components/frames/CarvedFrame";

/**
 * One heir, one envelope, stacked into a pile.
 *
 * The pile is the point. Every envelope but the last shows only the band that carries its
 * address plate and its seal, and the last lies open on top of them: what you read is a stack
 * of sealed bequests with the current one face up. The crop is deliberate and it is measured,
 * not guessed. The plate sits at 71.08% to 91.45% of the envelope's height, and the band
 * keeps everything from 64% down, so the plate clears the cut by seven percent at the top and
 * eight at the bottom. Nothing readable is ever sliced.
 *
 * Ratios, not breakpoints, hold that promise: the band is an aspect-ratio box, the envelope
 * inside it is anchored to the band's bottom edge, and the type is sized in `cqw` against the
 * envelope. The pile looks the same at 320px as at 1200px.
 */

/** The envelope's own aspect ratio. sourceRef: public/frames/heir-envelope.webp, 1120x491. */
const ENVELOPE_RATIO = 1120 / 491;

/**
 * How much of a covered envelope stays visible, from its bottom edge up. Unit: fraction of
 * the envelope's height. Chosen to contain the address plate with clearance on both sides.
 */
const BAND_FRACTION = 0.36;

/** Overlap at the seam, so the pile reads as paper resting on paper. Unit: percent of width. */
const SEAM_OVERLAP_PERCENT = 1.2;

/** Largest width one envelope is laid out at. Unit: CSS px. */
const ENVELOPE_MAX_WIDTH = 560;

type HeirEnvelopeProps = {
  /** Position in the will, from the first heir. Drives the seam and the stacking order. */
  index: number;
  /** How many envelopes are in the pile, so each one knows what it lies on. */
  pileSize: number;
  /** The last envelope lies open; every other one shows only its band. */
  isTop: boolean;
  /** The address plate's left column: who, then how much. */
  addressLine: ReactNode;
  amountLine: ReactNode;
  /** The plate's right column: paid, owed, or nothing before the will is settled. */
  settlement: ReactNode;
};

/**
 * The house entrance-delay ladder tops out at this step (`anim-d-6` in globals.css); a pile
 * deeper than the ladder deals its remaining envelopes together on the last beat.
 */
const DEAL_DELAY_STEPS = 6;

export function HeirEnvelope({
  index,
  pileSize,
  isTop,
  addressLine,
  amountLine,
  settlement,
}: HeirEnvelopeProps) {
  // The pile deals itself: each envelope rises one beat after the one it lands on.
  const dealDelayClass = `anim-d-${Math.min(index + 1, DEAL_DELAY_STEPS)}`;
  /*
   * The plate composes around what it holds. Before settlement there is no right column,
   * and a left-anchored pair of lines in a wide gold window read as a misprint hugging one
   * edge; alone, the address centres. Once a settlement mark exists the two columns share
   * the window edge to edge. 2.6cqw is measured against the longest content the plate
   * carries (a shortened address with the visitor mark, "100 % · 0.0000 ETH", and the retry
   * label beside them): it clears the window at every width the pile lays out at.
   */
  const hasSettlementColumn = settlement !== null;
  const envelope = (
    <CarvedFrame frame="heirEnvelope" maxWidth={ENVELOPE_MAX_WIDTH}>
      {[
        <div
          key="plate"
          className={`flex h-full w-full items-center gap-[3%] px-[2%] ${
            hasSettlementColumn ? "justify-between text-left" : "justify-center text-center"
          }`}
        >
          <span
            className={`flex min-w-0 flex-col ${hasSettlementColumn ? "" : "items-center"}`}
            style={{ fontSize: "2.6cqw", lineHeight: 1.4 }}
          >
            {addressLine}
            {amountLine}
          </span>
          {hasSettlementColumn ? (
            <span className="shrink-0 text-right" style={{ fontSize: "2.6cqw", lineHeight: 1.4 }}>
              {settlement}
            </span>
          ) : null}
        </div>,
      ]}
    </CarvedFrame>
  );

  return (
    <li
      className={`anim-rise ${dealDelayClass} relative w-full`}
      style={{
        maxWidth: ENVELOPE_MAX_WIDTH,
        /*
         * Earlier envelopes lie over later ones, which is the only order that lets the seams
         * show. Every frame casts its shadow downward, from the one light this product has,
         * so a band overlapping what is under it draws a real edge; stacked the other way the
         * covering envelope would have to cast upward and the whole pile read as one slab,
         * which is exactly what it did.
         */
        zIndex: pileSize - index,
        marginTop: index === 0 ? 0 : `-${SEAM_OVERLAP_PERCENT}%`,
      }}
    >
      {isTop ? (
        envelope
      ) : (
        <div
          className="relative w-full overflow-hidden"
          style={{ aspectRatio: `${ENVELOPE_RATIO / BAND_FRACTION}` }}
        >
          {/* Anchored to the band's bottom, so the crop takes the silk and never the plate. */}
          <div className="absolute inset-x-0 bottom-0">{envelope}</div>
        </div>
      )}
    </li>
  );
}
