"use client";

import { Check, Copy } from "@appica/icons-react";
import { useEffect, useRef, useState } from "react";

import { Key } from "@/components/ui/Key";

/**
 * A value you take with you: click the whole box, it is on your clipboard.
 *
 * This exists because the door link was previously a faint text link in the quietest ink the
 * palette has, and it was read by nobody. The link is the only thing an heir ever needs, so
 * it is now the most physical control on the page: a well you can hit anywhere, its own
 * label, and a confirmation you cannot miss.
 *
 * The confirmation spends no new motion budget. The mark trades through the house icon-swap
 * recipe (globals.css `.icon-swap`), and the well washes once with the same tonal bronze the
 * heartbeat charges with, as an opacity fade rather than a colour animation. No bounce: the
 * single overshoot in this product belongs to the seal landing and stays there.
 */

/** How long the confirmed state holds before the control returns to rest. Unit: ms. */
const CONFIRMATION_HOLD_MS = 2000;

type ClipboardResult = { ok: true } | { ok: false; reason: "unavailable" | "refused" };

/**
 * Writes to the clipboard as a value rather than a throw. The API is missing outside a
 * secure context and can be refused by permission policy, and both cases have to be told
 * apart: one is "your browser cannot", the other is "your browser would not".
 */
async function copyToClipboard(value: string): Promise<ClipboardResult> {
  if (typeof navigator === "undefined" || navigator.clipboard === undefined) {
    return { ok: false, reason: "unavailable" };
  }
  try {
    await navigator.clipboard.writeText(value);
    return { ok: true };
  } catch {
    return { ok: false, reason: "refused" };
  }
}

type CopyFieldProps = {
  value: string;
  /** Names the field above the box. */
  label: string;
  /** Resting hint, for example "Click to copy". */
  hint: string;
  confirmedLabel: string;
  failedLabel: string;
  /** Whether this is the page's one beckoning act, passed through to the key. */
  beckons?: boolean;
};

export function CopyField({
  value,
  label,
  hint,
  confirmedLabel,
  failedLabel,
  beckons,
}: CopyFieldProps) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const resetTimerRef = useRef<number | null>(null);

  // External system: window.setTimeout, which React does not own. The confirmed state has to
  // fall back to rest on its own, and an unmount mid-hold must not leave the timer running.
  useEffect(() => {
    return () => {
      if (resetTimerRef.current !== null) {
        window.clearTimeout(resetTimerRef.current);
      }
    };
  }, []);

  const runCopy = async () => {
    const result = await copyToClipboard(value);
    setState(result.ok ? "copied" : "failed");
    if (resetTimerRef.current !== null) {
      window.clearTimeout(resetTimerRef.current);
    }
    resetTimerRef.current = window.setTimeout(() => setState("idle"), CONFIRMATION_HOLD_MS);
  };

  const isCopied = state === "copied";

  return (
    <div className="flex w-full max-w-[62ch] flex-col gap-2">
      <span className="type-label">{label}</span>

      <Key
        onClick={() => void runCopy()}
        beckons={beckons === true}
        className="type-small group relative flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left"
      >
        {/*
          The wash. A tonal pass of the same bronze the heartbeat charges with, fading out on
          opacity alone so nothing paints or lays out. Keyed on the state so a second copy
          replays it.
        */}
        <span
          key={`wash-${state}-${String(isCopied)}`}
          aria-hidden="true"
          className={`key-inlay pointer-events-none absolute inset-0 ${
            isCopied ? "anim-wash-out" : "opacity-0"
          }`}
          // On the ink patch the wash is light, the same rising highlight the heartbeat
          // charges with; the old bronze-sunk pass belonged to a paper key that is gone.
          style={{ background: "rgba(255, 253, 247, 0.24)" }}
        />

        <span className="type-small type-numeric relative min-w-0 flex-1 truncate">{value}</span>

        <span
          aria-hidden="true"
          className="icon-swap relative shrink-0 opacity-80"
          data-state={isCopied ? "b" : "a"}
        >
          <Copy data-icon="a" size={16} strokeWidth={1.5} />
          <Check data-icon="b" size={16} strokeWidth={1.5} />
        </span>
      </Key>

      {/*
        One line under the box, and it is the same line in all three states so nothing below
        it jumps when the state changes. Announced, because the confirmation is otherwise
        only a 16px mark.
      */}
      <p
        role="status"
        aria-live="polite"
        className={`type-small ${state === "failed" ? "text-cinnabar" : "text-ink-faint"}`}
      >
        {state === "copied" ? confirmedLabel : state === "failed" ? failedLabel : hint}
      </p>
    </div>
  );
}
