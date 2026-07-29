import Link from "next/link";

import { LanguageToggle } from "@/components/i18n/LanguageProvider";
import { Seal } from "@/components/scene/Seal";
import { WalletControl } from "@/components/nav/WalletControl";

/**
 * The name-board. A Chinese doorway carries a 匾额, a lacquered plaque hung on the beam
 * above it, so the nav is that plaque: one contained object under the roof holding the
 * mark, the name, the language, and the wallet. No link row, because there is nothing to
 * list.
 *
 * It hangs below the roof rather than at a fixed offset, so the two never collide on a
 * short viewport.
 *
 * The wordmark is set in sentence case at normal tracking. An all-caps serif tracked out
 * is the stock luxury logo move and would undo the rest of the page.
 */
export function DoorwayNav() {
  return (
    <header
      className="pointer-events-none fixed inset-x-0 top-[max(5rem,13vh)] flex justify-center px-6"
      style={{ zIndex: "var(--layer-nav)" }}
    >
      <nav className="anim-plaque panel pointer-events-auto flex items-center gap-4 px-4 py-2.5 sm:gap-5 sm:px-5">
        <Link
          href="/"
          className="flex items-center gap-2.5 transition-opacity duration-(--dur-small) ease-(--ease-standard) hover:opacity-80"
        >
          <Seal size={18} />
          <span className="type-title leading-none">Testament</span>
        </Link>
        {/*
          A cut in the plaque, not a drawn line: the divider is the field showing through,
          the way a bracket set is separated by shadow. A light hairline here would be an
          ornamental rule, which is its own tell.
        */}
        <span aria-hidden="true" className="-my-2.5 w-0.5 self-stretch bg-field" />
        <LanguageToggle />
        <span aria-hidden="true" className="-my-2.5 w-0.5 self-stretch bg-field" />
        <WalletControl />
      </nav>
    </header>
  );
}
