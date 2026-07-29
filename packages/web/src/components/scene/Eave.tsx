/**
 * The eave the curtain hangs from: a painted beam carried by a run of brackets.
 *
 * Built as a repeating row of real SVG brackets rather than one stretched illustration, so
 * nothing distorts at any width and the edges stay crisp on every screen.
 *
 * The bracket is a reading of the dougong, the stacked bracket set that carries a Chinese
 * roof: horizontal blocks of decreasing width, seen head on, with a gap of shadow between
 * each. Drawn as stacked bars rather than a single stepped outline, because a stepped
 * outline reads as a saw blade and a dougong is a stack of beams.
 */

/** Width of one bracket cell. Unit: CSS px. Sets how dense the run reads. */
const BRACKET_CELL_PX = 52;

/** Bars of the stack, from the beam down. Widths are fractions of the cell. */
const BRACKET_BARS = [
  { inset: 0, top: 0, height: 4.5 },
  { inset: 7, top: 6, height: 4 },
  { inset: 15, top: 11.5, height: 3.5 },
  { inset: 22, top: 16.5, height: 3 },
] as const;

const BRACKET_WIDTH = 52;

function Bracket() {
  return (
    <svg
      viewBox={`0 0 ${BRACKET_WIDTH} 21`}
      className="h-[21px] w-full"
      preserveAspectRatio="xMidYMin meet"
      aria-hidden="true"
      focusable="false"
    >
      {BRACKET_BARS.map((bar) => (
        <g key={bar.top}>
          <rect
            x={bar.inset}
            y={bar.top}
            width={BRACKET_WIDTH - bar.inset * 2}
            height={bar.height}
            fill="var(--color-field-sunk)"
          />
          {/* One light source, from above: each block catches it on its upper edge only. */}
          <rect
            x={bar.inset}
            y={bar.top}
            width={BRACKET_WIDTH - bar.inset * 2}
            height={0.75}
            fill="rgba(234, 224, 206, 0.07)"
          />
        </g>
      ))}
    </svg>
  );
}

export function Eave() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 overflow-hidden"
      style={{ zIndex: "var(--layer-curtain)" }}
    >
      {/* The beam: a solid mass with the light catching its lower lip. */}
      <div className="h-9 w-full bg-field-sunk sm:h-12" />
      <div className="h-px w-full bg-[rgba(234,224,206,0.09)]" />
      <div
        className="grid w-full"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${BRACKET_CELL_PX}px, 1fr))` }}
      >
        {/* auto-fill decides how many are visible; the surplus is clipped by the parent. */}
        {Array.from({ length: 44 }, (_unused, bracketIndex) => (
          <Bracket key={bracketIndex} />
        ))}
      </div>
    </div>
  );
}
