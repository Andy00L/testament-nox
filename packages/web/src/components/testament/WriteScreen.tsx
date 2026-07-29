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
    <div className="mx-auto w-full max-w-[1120px] px-6 pb-10 pt-[max(7.75rem,18.5vh)] sm:px-10">
      <div className="mx-auto mb-6 flex max-w-[44rem] flex-col items-center gap-3 text-center">
        <h1 className="type-display-lg">{copy.write.title}</h1>
        <p className="type-small max-w-[58ch] text-ink-muted">{copy.write.lede}</p>
      </div>

      <div className="panel mx-auto w-full max-w-[62rem] p-6 sm:p-7">
        <WritePanel />
      </div>

      <p className="mt-5 text-center">
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
