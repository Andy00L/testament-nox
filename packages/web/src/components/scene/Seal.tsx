/**
 * The seal: this product's one bespoke silhouette.
 *
 * A carved stone stamp pressed in cinnabar paste, with the edges left deliberately
 * uneven the way a real impression is: the block never lands perfectly flat, so the
 * outline wavers and the paste thins at one corner. The character is 承 (chéng), to
 * receive what is passed on.
 *
 * Placement rule, from the design system: at most one seal per screen, only ever on an
 * irreversible action, always at the point of commitment.
 */

type SealProps = {
  /** Rendered size. Unit: CSS px. */
  size?: number;
  /** 0 hides the impression, 1 is fully pressed. Drives the press animation. */
  pressed?: number;
  className?: string;
};

/**
 * The impression outline. Every corner is off by a pixel or two on purpose; a clean
 * square would read as a rounded rect from a component kit rather than a pressed stone.
 */
const IMPRESSION_PATH =
  "M7.4 5.2 C24 3.4 41 3.1 57.6 4.4 C60.2 4.6 61.3 6.1 61.6 8.6 C63.1 25 63.4 41.8 62 58.2 C61.7 60.9 60.3 62.1 57.4 62.4 C41 63.9 24.2 64.1 7.8 62.6 C5.1 62.3 3.8 61 3.5 58.2 C2.1 41.6 2.2 24.6 3.8 8.2 C4.1 6.2 5.2 5.4 7.4 5.2 Z";

export function Seal({ size = 64, pressed = 1, className }: SealProps) {
  return (
    <svg
      viewBox="0 0 66 68"
      width={size}
      height={size * (68 / 66)}
      className={className}
      role="img"
      aria-label="Sceau de scellement"
      style={{ opacity: pressed }}
    >
      <defs>
        {/*
          The paste is never even: it pools where the stone bit hardest and thins at the
          lifted corner. One directional light, matching the rest of the product.
        */}
        <radialGradient id="seal-paste" cx="38%" cy="30%" r="82%">
          <stop offset="0%" stopColor="var(--color-cinnabar)" stopOpacity="1" />
          <stop offset="72%" stopColor="var(--color-cinnabar)" stopOpacity="0.94" />
          <stop offset="100%" stopColor="var(--color-cinnabar)" stopOpacity="0.72" />
        </radialGradient>
        <clipPath id="seal-clip">
          <path d={IMPRESSION_PATH} />
        </clipPath>
      </defs>

      <path d={IMPRESSION_PATH} fill="url(#seal-paste)" />

      {/*
        Carved in relief (朱文): the character is cut away from the block, so it reads in
        the surface underneath rather than in ink.
      */}
      <g clipPath="url(#seal-clip)">
        <text
          x="33"
          y="34"
          textAnchor="middle"
          dominantBaseline="central"
          fontFamily="var(--font-hanzi)"
          fontSize="40"
          fontWeight="500"
          fill="var(--color-field)"
        >
          承
        </text>
        {/* Two flecks where the paste failed to take. Craft lives in the imperfection. */}
        <circle cx="14" cy="52" r="1.6" fill="var(--color-field)" opacity="0.5" />
        <circle cx="52" cy="16" r="1.1" fill="var(--color-field)" opacity="0.38" />
      </g>
    </svg>
  );
}
