import { PassageLink } from "@/components/ui/PassageLink";
import { TestamentStatus } from "@/components/testament/TestamentStatus";
import { WordDevice } from "@/components/scene/WordDevice";

/**
 * The scene.
 *
 * The curtain owns the fold. The scroll hangs on the wall behind it, the copy sits in
 * front of it, and the two land on opposite ends of one diagonal rather than stacking down
 * the middle. The whole composition fits one viewport, so nothing from below ever peeks in
 * under the hero.
 *
 * Every word here renders whether or not the canvas ever paints.
 */
export default function ScenePage() {
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-[1120px] flex-col px-6 sm:px-10">
      {/* The scroll: behind the curtain, so the strands cross in front of it. */}
      <div
        className="pointer-events-none absolute right-6 top-[19vh] sm:right-10 sm:top-[16vh]"
        style={{ zIndex: "var(--layer-behind-curtain)" }}
      >
        <WordDevice />
      </div>

      <div className="mt-auto flex max-w-[34rem] flex-col gap-7 pb-20 pt-44 sm:pb-24">
        <h1 className="type-display-hero">
          Votre Safe vous survivra.
          <br />
          Vos clés, non.
        </h1>

        <p className="type-body max-w-[46ch] text-ink-muted">
          Les héritiers et les parts restent chiffrés. Vous envoyez un signe de vie. Le jour où
          le silence dure trop longtemps, le Safe paie.
        </p>

        <TestamentStatus />

        <div className="flex flex-wrap items-baseline gap-x-10 gap-y-4">
          <PassageLink href="/ecrire">Écrire le testament</PassageLink>
          <PassageLink href="/porte" tone="quiet">
            Je suis un héritier
          </PassageLink>
        </div>
      </div>
    </div>
  );
}
