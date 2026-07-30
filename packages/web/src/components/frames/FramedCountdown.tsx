import { CarvedFrame, type FrameName } from "@/components/frames/CarvedFrame";

/**
 * The remaining silence, mounted in a carved frame.
 *
 * Two frames carry it, and which one you are looking at tells you where you stand. The
 * zodiac dial, with an hourglass on either side, is what the author sees while the wind is
 * still theirs to send. The opened fan is what the door shows, where the same figure is
 * public and nobody can do anything about it.
 *
 * Deliberately not the stock countdown widget: no row of tiles, no DAYS / HRS / MIN / SEC
 * caps under separate boxes. One line of type, tabular so the digits never jitter as they
 * tick, and the frame around it doing the work a pile of boxes would otherwise be asked to
 * do. The reason the old countdown went unread was not that its number was too small; it was
 * that it was a grey sentence with nothing holding it.
 */

type FramedCountdownProps = {
  /** The formatted remaining time, already in the reader's language. */
  remaining: string | null;
  /** Shown instead of the remaining time once the deadline has passed. */
  expiredLabel: string;
  isExpired: boolean;
  /** Read out to assistive technology, since the frame itself says nothing. */
  label: string;
  frame: Extract<FrameName, "hourglass" | "fan">;
  maxWidth: number;
  className?: string;
};

export function FramedCountdown({
  remaining,
  expiredLabel,
  isExpired,
  label,
  frame,
  maxWidth,
  className,
}: FramedCountdownProps) {
  const reading = isExpired ? expiredLabel : remaining;

  return (
    // The frame wipes open on arrival: the same draw-on family as the write sheet's unroll,
    // in a fan's own direction. `anim-wipe` is fill-mode both, so without animation the frame
    // simply stands open.
    <CarvedFrame frame={frame} maxWidth={maxWidth} className={`anim-wipe ${className ?? ""}`}>
      {[
        <p
          key="reading"
          // aria-live: the figure changes without any interaction, and on the door it is the
          // one thing that decides whether the page can be acted on at all.
          aria-live="polite"
          aria-label={reading === null ? undefined : `${label} ${reading}`}
          className="type-numeric text-center text-ink"
          style={{
            // Sized against the frame, not the viewport, so the line stays inside its window
            // at every width. Leading is tight because the window is short.
            fontSize: isExpired ? "4.2cqw" : "5.2cqw",
            lineHeight: 1.15,
            letterSpacing: "0.01em",
            textWrap: "balance",
          }}
        >
          {/* A blank tick would collapse the window and shift the frame; a space holds it. */}
          {reading ?? " "}
        </p>,
      ]}
    </CarvedFrame>
  );
}
