"use client";

import { PassageLink } from "@/components/ui/PassageLink";
import { TestamentStatus } from "@/components/testament/TestamentStatus";
import { WordDevice } from "@/components/scene/WordDevice";
import { useTranslation } from "@/components/i18n/LanguageProvider";

/**
 * The scene's content.
 *
 * The curtain owns the fold. The scroll hangs on the wall behind it, the copy sits in front
 * of it, and the two land on opposite ends of one diagonal rather than stacking down the
 * middle. The whole composition fits one viewport, so nothing from below peeks in under the
 * hero.
 *
 * Every word here renders whether or not the canvas ever paints.
 */
export function SceneHero() {
  const { copy } = useTranslation();

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col px-6 sm:px-10">
      {/* The scroll: behind the curtain, so the strands cross in front of it. */}
      <div
        className="pointer-events-none absolute right-6 top-[26vh] sm:right-10 sm:top-[24vh]"
        style={{ zIndex: "var(--layer-behind-curtain)" }}
      >
        <WordDevice />
      </div>

      <div className="mt-auto flex max-w-[34rem] flex-col gap-6 pb-16 pt-[34vh] sm:gap-7 sm:pb-20">
        <h1 className="type-display-hero">
          <span className="anim-rise anim-d-2 block">{copy.scene.headlineFirst}</span>
          <span className="anim-rise anim-d-3 block">{copy.scene.headlineSecond}</span>
        </h1>

        <p className="anim-rise anim-d-4 type-body max-w-[46ch] text-ink-muted">
          {copy.scene.lede}
        </p>

        <TestamentStatus />

        <div className="anim-rise anim-d-5 flex flex-wrap items-baseline gap-x-10 gap-y-4">
          <PassageLink href="/ecrire">{copy.scene.write}</PassageLink>
          <PassageLink href="/porte" tone="quiet">
            {copy.scene.heir}
          </PassageLink>
          <PassageLink href="/apropos" tone="quiet">
            {copy.scene.about}
          </PassageLink>
        </div>
      </div>
    </div>
  );
}
