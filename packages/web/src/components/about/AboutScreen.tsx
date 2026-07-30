"use client";

import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";

import { PassageLink } from "@/components/ui/PassageLink";
import { useTranslation } from "@/components/i18n/LanguageProvider";

/**
 * The explanation, on the same parchment as the will itself.
 *
 * One scroll, read top to bottom: what this house keeps, then the six gestures with a
 * photograph of each. The images are the real screens with the rehearsal wallets in them,
 * so what the page promises and what the visitor then sees are the same thing.
 */

/**
 * TikTok Sans, asked for by name for this page's reading voice, self-hosted (SIL OFL, the
 * latin subset carries every French diacritic this copy uses). It lands on the wrapper as a
 * className, so prose inherits it while every `.type-display-*` and `.type-title` heading
 * keeps the engraved display face: one quiet reading voice under one ceremonial one.
 */
const tiktokSans = localFont({
  src: "../../fonts/tiktok-sans-latin.woff2",
  weight: "300 900",
  display: "swap",
});

/** The step photographs, in the order the steps are told. Captured by about-shots.ts. */
const STEP_IMAGES = [
  "/about/step-connect.webp",
  "/about/step-vault.webp",
  "/about/step-write.webp",
  "/about/step-heartbeat.webp",
  "/about/step-door-closed.webp",
  "/about/step-door-open.webp",
] as const;

/** Native size of every capture. Unit: pixels. */
const IMAGE_WIDTH = 1600;
const IMAGE_HEIGHT = 1000;

export function AboutScreen() {
  const { copy } = useTranslation();

  return (
    <div
      className={`${tiktokSans.className} mx-auto w-full max-w-[1120px] px-6 pb-24 pt-[max(7.75rem,19vh)] sm:px-10 sm:pb-16`}
    >
      <div className="mx-auto mb-4 flex max-w-[44rem] flex-col items-center gap-3 text-center">
        <h1 className="anim-rise anim-d-1 type-display-lg">{copy.about.title}</h1>
        <p className="anim-rise anim-d-2 type-small max-w-[64ch] text-ink-muted">
          {copy.about.lede}
        </p>
      </div>

      <div className="anim-unroll scroll-sheet mx-auto w-full max-w-[70rem] p-2 sm:p-4">
        <div className="anim-rise anim-d-4 mx-auto flex max-w-[44rem] flex-col gap-10 py-4">
          <section className="flex flex-col gap-3">
            <h2 className="type-display-lg">{copy.about.conceptTitle}</h2>
            <p className="type-body text-ink-muted">{copy.about.conceptBody}</p>
          </section>

          <section className="flex flex-col gap-8">
            <h2 className="type-display-lg">{copy.about.stepsTitle}</h2>
            <ol className="flex flex-col gap-10">
              {copy.about.steps.map((step, stepIndex) => (
                <li key={step.title} className="flex flex-col gap-3">
                  <div className="flex items-baseline gap-3">
                    <span className="type-small type-numeric text-bronze-deep">
                      {stepIndex + 1}
                    </span>
                    <h3 className="type-title">{step.title}</h3>
                  </div>
                  <p className="type-body text-ink-muted">{step.body}</p>
                  {/* A photograph mounted on the scroll: the panel is its paper backing. */}
                  <div className="panel mt-1 p-1.5">
                    <Image
                      src={STEP_IMAGES[stepIndex] ?? STEP_IMAGES[0]}
                      alt={step.alt}
                      width={IMAGE_WIDTH}
                      height={IMAGE_HEIGHT}
                      sizes="(min-width: 800px) 704px, 100vw"
                      className="h-auto w-full"
                    />
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4 pb-2">
            <PassageLink href="/ecrire">{copy.about.cta}</PassageLink>
          </div>
        </div>
      </div>

      <p className="mt-4 text-center">
        <Link
          href="/"
          className="type-small text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
        >
          {copy.about.back}
        </Link>
      </p>
    </div>
  );
}
