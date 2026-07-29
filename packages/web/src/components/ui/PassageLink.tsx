import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The way through. A doorway link rather than a button: a brush stroke that ends in a
 * slight hook, set beside display type.
 *
 * On hover the mark travels and the ink lifts. It does not grow an underline, does not
 * lift the whole control off the page, and does not carry the stock right-pointing arrow.
 */
export function PassageLink({
  href,
  children,
  tone = "primary",
}: {
  href: string;
  children: ReactNode;
  tone?: "primary" | "quiet";
}) {
  const isPrimary = tone === "primary";

  return (
    <Link
      href={href}
      className={`group inline-flex items-baseline gap-3 transition-colors duration-(--dur-small) ease-(--ease-standard) ${
        isPrimary ? "type-title text-ink hover:text-brass" : "type-small text-ink-muted hover:text-ink"
      }`}
    >
      <span>{children}</span>
      <svg
        viewBox="0 0 26 10"
        aria-hidden="true"
        focusable="false"
        className="w-[26px] shrink-0 translate-x-0 transition-transform duration-(--dur-small) ease-(--ease-standard) group-hover:translate-x-1"
        style={{ height: isPrimary ? 10 : 8 }}
      >
        {/* One stroke, lifting at the end. Drawn for this product, not an icon-pack arrow. */}
        <path
          d="M0.8 7.4 C7 7.4 13.5 7 18.4 4.6 L25 1.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <path d="M19.6 0.8 L25.2 1.1 L24.4 6.2" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
}
