"use client";

import Link from "next/link";

import { WritePanel } from "@/components/testament/WritePanel";
import { useTranslation } from "@/components/i18n/LanguageProvider";

/**
 * The ritual, on one sheet.
 *
 * A centred title under the plaque, then one wide panel holding both halves of the will
 * side by side, sized so the whole act (name the heirs, set the silence, press the seal)
 * fits a single viewport. The curtain keeps moving behind it, so the page never stops
 * being the same place.
 */
export function WriteScreen() {
  const { copy } = useTranslation();

  return (
    /*
      The top padding clears the floating nav, and the title has to live under it rather than
      behind it. The room the seal needs at the bottom of the fold is bought by giving the lede
      a wider measure so it sets in two lines instead of three, not by moving the title up.
    */
    <div className="mx-auto w-full max-w-[1120px] px-6 pb-8 pt-[max(7.75rem,18vh)] sm:px-10">
      <div className="mx-auto mb-3 flex max-w-[56rem] flex-col items-center gap-2 text-center">
        <h1 className="anim-rise anim-d-1 type-display-lg">{copy.write.title}</h1>
        <p className="anim-rise anim-d-2 type-small max-w-[86ch] text-ink-muted">{copy.write.lede}</p>
      </div>

      <div className="anim-unroll scroll-sheet mx-auto w-full max-w-[70rem] p-2 sm:p-4">
        <div className="anim-rise anim-d-4">
          <WritePanel />
        </div>
      </div>

      <p className="mt-4 text-center">
        <Link
          href="/"
          className="type-small text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
        >
          {copy.write.back}
        </Link>
      </p>
    </div>
  );
}
