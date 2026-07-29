import Link from "next/link";

import { Seal } from "@/components/scene/Seal";
import { WalletControl } from "@/components/nav/WalletControl";

/**
 * The name-board. A Chinese doorway carries a 匾额, a lacquered plaque hung on the beam
 * above it, so the nav is that plaque: one contained object under the eave holding the
 * mark, the name, and the wallet. No link row, because there is nothing to list.
 *
 * The wordmark is set in sentence case at normal tracking. An all-caps serif tracked out
 * is the stock luxury logo move and would undo the rest of the page.
 */
export function DoorwayNav() {
  return (
    <header
      className="pointer-events-none fixed inset-x-0 top-14 flex justify-center px-6 sm:top-[4.5rem]"
      style={{ zIndex: "var(--layer-nav)" }}
    >
      <nav className="lacquer pointer-events-auto flex items-center gap-4 px-4 py-2.5 sm:gap-5 sm:px-5">
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
        <span aria-hidden="true" className="-my-2.5 w-0.5 self-stretch bg-field sm:-my-2.5" />
        <WalletControl />
      </nav>
    </header>
  );
}
