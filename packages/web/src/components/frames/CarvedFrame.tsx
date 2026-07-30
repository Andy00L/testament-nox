import Image, { type StaticImageData } from "next/image";
import type { CSSProperties, ReactNode } from "react";

import fanFrameImage from "@/../public/frames/fan-frame.webp";
import heirEnvelopeImage from "@/../public/frames/heir-envelope.webp";
import hourglassFrameImage from "@/../public/frames/hourglass-frame.webp";
import legacyBoxImage from "@/../public/frames/legacy-box.webp";

/**
 * The carved frames: painted objects the interface mounts its live controls inside.
 *
 * The problem this solves is stated in the design law twice over. Content sliced by an edge
 * reads as broken, and a control that sits near a cut without being padded clear of it will
 * be cropped on some screen nobody tested. So the mounting is not eyeballed: every window in
 * every frame was measured off the shipped WebP by flood-filling its alpha channel, and the
 * numbers below are those measurements as percentages of the frame's own box.
 *
 * Percentages are what make the promise hold. The frame is laid out by `aspect-ratio`, each
 * window is positioned in percent of that box, and the type inside is sized in `cqw` against
 * the frame as a container. Every part of the composition therefore scales by the same
 * factor: a window that contains its content at 1200px contains it at 320px, with no
 * breakpoint to forget.
 */

/** A window in a frame, as percentages of the frame's own box. */
type FrameWindow = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type FrameDefinition = {
  image: StaticImageData;
  /**
   * Padding held between a window's measured edge and its content, so nothing lands on the
   * gold lip that draws the window. Unit: percent of the frame's width.
   */
  clearance: number;
  windows: readonly FrameWindow[];
};

/**
 * Measured geometry, one entry per frame.
 *
 * sourceRef: measured on public/frames/*.webp after
 * `bun run scripts/optimise-scene-assets.ts`, by flood-filling the alpha channel from the
 * border and taking the bounding box of each enclosed hole (the plaque slots and the
 * envelope slot) or of the uniform paper panel (the dial and the fan). Re-measure if the
 * source art is ever replaced; the frames carry no safe margin of their own.
 */
const FRAMES = {
  /** The two-slot plaque. Two windows, so it carries at most two actions. */
  legacyBox: {
    image: legacyBoxImage,
    clearance: 1.4,
    windows: [
      { left: 11.21, top: 62.96, width: 36.13, height: 18.98 },
      { left: 52.66, top: 62.73, width: 36.21, height: 19.21 },
    ],
  },
  /** One envelope per heir. Its single slot carries the address. */
  heirEnvelope: {
    image: heirEnvelopeImage,
    clearance: 1.2,
    windows: [{ left: 36.07, top: 71.08, width: 51.88, height: 20.37 }],
  },
  /** The zodiac dial, with its two hourglasses. Mounted while the author is still alive. */
  hourglass: {
    image: hourglassFrameImage,
    clearance: 1.6,
    windows: [{ left: 32.5, top: 26.19, width: 32.5, height: 37.94 }],
  },
  /** The opened fan. Mounted on the door, where the countdown is public. */
  fan: {
    image: fanFrameImage,
    clearance: 1.6,
    windows: [{ left: 33.68, top: 30.93, width: 32.83, height: 36.48 }],
  },
} as const satisfies Record<string, FrameDefinition>;

export type FrameName = keyof typeof FRAMES;

/**
 * The cast shadow. Same recipe as the handscroll (globals.css `.scroll-sheet`): these
 * silhouettes are not rectangles, so a box shadow would draw a box behind a plaque. One
 * light from above, tinted with the field's own darkest ink, never pure black, and offset
 * downward rather than bloomed on all sides.
 */
const FRAME_CAST = "drop-shadow(0 10px 22px rgba(58, 45, 42, 0.16))";

type CarvedFrameProps = {
  frame: FrameName;
  /** One node per window, in the frame's own order. Extra nodes are not rendered. */
  children: readonly ReactNode[];
  /** Largest width the frame is ever laid out at, for the responsive image hint. */
  maxWidth: number;
  className?: string;
  priority?: boolean;
};

export function CarvedFrame({
  frame,
  children,
  maxWidth,
  className,
  priority,
}: CarvedFrameProps) {
  const definition: FrameDefinition = FRAMES[frame];
  const { image, windows, clearance } = definition;

  return (
    <div
      className={`relative w-full ${className ?? ""}`}
      style={{
        aspectRatio: `${image.width} / ${image.height}`,
        maxWidth,
        containerType: "inline-size",
      }}
    >
      <Image
        src={image}
        alt=""
        aria-hidden="true"
        priority={priority}
        sizes={`(max-width: ${maxWidth}px) 100vw, ${maxWidth}px`}
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
        style={{ filter: FRAME_CAST }}
      />

      {windows.map((frameWindow, windowIndex) => {
        const content = children[windowIndex];
        if (content === undefined || content === null) {
          return null;
        }
        return (
          <div
            key={`${frame}-${windowIndex}`}
            className="absolute grid place-items-center"
            style={
              {
                left: `${frameWindow.left + clearance}%`,
                top: `${frameWindow.top}%`,
                width: `${frameWindow.width - clearance * 2}%`,
                height: `${frameWindow.height}%`,
              } satisfies CSSProperties
            }
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}
