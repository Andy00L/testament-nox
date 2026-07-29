import Image from "next/image";

import roofImage from "@/../public/scene/roof.webp";

/**
 * The roof the curtain hangs under.
 *
 * A painted double-eave roof in the Forbidden City manner, from Marina Budarina's chimes
 * project, used with her permission (declared in the README).
 *
 * Cropped to a band and anchored to its own bottom edge, so what shows is the underside and
 * the lower eave: the part you would actually see standing in the doorway. Rendering the
 * whole roof would make the building the subject, and the subject is the curtain.
 */

/** Height of the visible roof band. Unit: CSS px and vh, clamped so it never owns the fold. */
const ROOF_BAND = "clamp(96px, 19vh, 210px)";

/** How much wider than the viewport the roof is drawn, so its ends crop off. */
const ROOF_OVERHANG = 1.15;

export function Eave() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 top-0 overflow-hidden"
      style={{ zIndex: "var(--layer-roof)", height: ROOF_BAND }}
    >
      <div
        className="relative left-1/2 h-full -translate-x-1/2"
        style={{ width: `${ROOF_OVERHANG * 100}%`, minWidth: 820 }}
      >
        <Image
          src={roofImage}
          alt=""
          priority
          sizes="115vw"
          className="h-full w-full select-none object-cover"
          style={{ objectPosition: "50% 100%" }}
        />
      </div>
    </div>
  );
}
