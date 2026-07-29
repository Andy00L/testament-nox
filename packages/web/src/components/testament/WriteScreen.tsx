"use client";

import Link from "next/link";

import { WritePanel } from "@/components/testament/WritePanel";
import { useTranslation } from "@/components/i18n/LanguageProvider";

/**
 * The ritual.
 *
 * A single narrow column laid over the scene, the way a scroll is unrolled in a doorway.
 * The curtain keeps moving behind it, so the page never stops being the same place.
 */
export function WriteScreen() {
  const { copy } = useTranslation();

  return (
    <div className="mx-auto w-full max-w-[1120px] px-6 pb-24 pt-40 sm:px-10 sm:pt-48">
      <div className="max-w-[38rem]">
        <div className="mb-12 flex flex-col gap-4">
          <h1 className="type-display-hero">{copy.write.title}</h1>
          <p className="type-body text-ink-muted">{copy.write.lede}</p>
        </div>

        <div className="panel p-6 sm:p-8">
          <WritePanel />
        </div>

        <Link
          href="/"
          className="type-small mt-10 inline-block text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
        >
          {copy.write.back}
        </Link>
      </div>
    </div>
  );
}
