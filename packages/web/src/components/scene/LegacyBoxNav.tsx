"use client";

import Link from "next/link";

import { CarvedFrame } from "@/components/frames/CarvedFrame";

/**
 * The two ways into this product, mounted in the legacy plaque.
 *
 * The plaque is carved with exactly two windows and the scene offers exactly two doors: write
 * a testament, or arrive as an heir. Everything else on the home page is prose, so these are
 * the only two controls that need to be objects rather than lines of text. "How it works"
 * stays a quiet link outside the plaque; it is reading, not entering.
 *
 * Its windows were measured off the artwork and the labels are sized in `cqw` against the
 * plaque, so the two doors stay inside their slots from a phone to a wide desktop.
 */

/** Largest width the plaque is laid out at in the hero. Unit: CSS px. */
const PLAQUE_MAX_WIDTH = 540;

/**
 * One type size for both doors, against the plaque rather than the viewport, with a floor so
 * the labels stay readable on a phone. The floor is safe: at the narrowest the plaque is laid
 * out at, the longer of the two labels still measures well inside its 36.13% window.
 */
const SLOT_TYPE_SIZE = "max(10px, 2.4cqw)";

type LegacyBoxNavProps = {
  writeHref: string;
  writeLabel: string;
  heirHref: string;
  heirLabel: string;
  /** Names the plaque for assistive technology; the artwork carries no text of use. */
  title: string;
};

export function LegacyBoxNav({
  writeHref,
  writeLabel,
  heirHref,
  heirLabel,
  title,
}: LegacyBoxNavProps) {
  return (
    <nav aria-label={title} className="flex w-full justify-start">
      <CarvedFrame frame="legacyBox" maxWidth={PLAQUE_MAX_WIDTH} priority>
        {[
          <PlaqueDoor key="write" href={writeHref} label={writeLabel} />,
          <PlaqueDoor key="heir" href={heirHref} label={heirLabel} />,
        ]}
      </CarvedFrame>
    </nav>
  );
}

function PlaqueDoor({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      // The hit area is allowed past the window's short edge: the window draws the control,
      // the target is what a thumb needs. Nothing visible crosses the gold lip.
      className="grid h-full min-h-11 w-full place-items-center text-ink transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-bronze-deep"
    >
      <span
        className="text-center"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: SLOT_TYPE_SIZE,
          lineHeight: 1.1,
          letterSpacing: "-0.01em",
        }}
      >
        {label}
      </span>
    </Link>
  );
}
