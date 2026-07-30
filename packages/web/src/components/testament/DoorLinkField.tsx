"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

import { CopyField } from "@/components/ui/CopyField";
import { useTranslation } from "@/components/i18n/LanguageProvider";

/**
 * The door link, absolute so it survives being pasted into a message.
 *
 * One component because it is one promise, kept in two places: on the home page while the
 * author lives, and on the write sheet the moment the seal lands. The link an heir will need
 * one day is the single thing the author takes away from sealing, and as a faint one-line
 * path it was being missed at the exact moment it mattered most.
 *
 * The origin can only be read in the browser, so the field renders the path on the server and
 * upgrades once mounted. Both forms address the same door; the upgrade only decides whether
 * an heir can click it without knowing where the site lives.
 */
export function DoorLinkField({
  testamentId,
  beckons,
}: {
  testamentId: bigint;
  /** Whether this is the page's one beckoning act, per the one-beckon-per-screen rule. */
  beckons?: boolean;
}) {
  const { copy } = useTranslation();
  const path = `/porte?id=${String(testamentId)}`;

  /**
   * External system: the browser's own location. Read through useSyncExternalStore rather
   * than an effect, because the origin never changes once the document exists: there is
   * nothing to subscribe to, and the server simply has no value to give.
   */
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  return (
    <div className="flex flex-col gap-2">
      <CopyField
        value={`${origin}${path}`}
        label={copy.status.shareDoor}
        hint={copy.status.doorLinkCopy}
        confirmedLabel={copy.status.doorLinkCopied}
        failedLabel={copy.status.doorLinkCopyFailed}
        beckons={beckons}
      />
      <Link
        href={path}
        className="type-small w-fit text-ink-faint transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
      >
        {copy.status.goToDoor}
      </Link>
    </div>
  );
}
