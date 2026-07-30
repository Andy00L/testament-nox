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
const SLOT_TYPE_SIZE = "max(11px, 2.4cqw)";

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
    // Shrink to the plaque rather than claiming the row: a full-width nav pushed everything
    // beside it onto its own line, which is how "How it works" ended up stranded underneath.
    <nav aria-label={title} className="w-full shrink-0" style={{ maxWidth: PLAQUE_MAX_WIDTH }}>
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
      // The link is exactly its window, and the thumb target is a pseudo-element grown from
      // its centre. Setting a min-height on the link itself was wrong: on a phone the window
      // is shorter than 44px, so the link grew downward and pushed its own label onto the
      // slot's lower rim. Growing the target symmetrically keeps the label centred in the
      // slot at every width while the tappable area stays the size a thumb needs.
      //
      // The plaque is painted lacquer, so the door cannot be given the key's paper press. It
      // gets the same three readings in the one register a carved slot has: the engraved
      // label warms toward bronze under a pointer, and settles a hair deeper into its slot
      // when pressed. Type only, so nothing ever crosses the gold lip.
      className="group/door relative grid h-full w-full cursor-pointer place-items-center text-ink transition-colors duration-(--dur-small) ease-(--ease-standard) after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] hover:text-bronze-deep"
    >
      <span
        className="text-center transition-transform duration-(--dur-micro) ease-(--ease-standard) group-active/door:scale-[0.96]"
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
