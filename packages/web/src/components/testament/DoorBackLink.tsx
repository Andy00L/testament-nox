"use client";

import Link from "next/link";

import { useTranslation } from "@/components/i18n/LanguageProvider";

/** The way back from the door, in the visitor's language. */
export function DoorBackLink() {
  const { copy } = useTranslation();

  return (
    <Link
      href="/"
      className="type-small mt-12 inline-block text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
    >
      {copy.door.back}
    </Link>
  );
}
