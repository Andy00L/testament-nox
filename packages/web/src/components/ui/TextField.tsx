"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";

/**
 * One field, one label, one error slot, always present so nothing shifts when a message
 * appears. Built on the native input rather than a re-implementation of one: the browser's
 * control already handles selection, autofill, IME and assistive tech correctly.
 */

type TextFieldProps = {
  label: string;
  /**
   * A mark shown beside the label, for a field whose value belongs to a named product. Bare:
   * the mark sits on the paper, never in a tile.
   */
  labelMark?: ReactNode;
  error?: string | null;
  hint?: ReactNode;
  suffix?: ReactNode;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className" | "id">;

export function TextField({ label, labelMark, error, hint, suffix, ...inputProps }: TextFieldProps) {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="type-label flex items-center gap-1.5">
        {label}
        {labelMark}
      </label>

      <div className="panel-well flex items-center gap-2 px-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-bronze">
        <input
          {...inputProps}
          id={fieldId}
          aria-invalid={error != null && error !== "" ? true : undefined}
          aria-describedby={[error != null && error !== "" ? errorId : null, hint != null ? hintId : null]
            .filter((value) => value !== null)
            .join(" ") || undefined}
          className="type-small type-numeric min-h-11 w-full bg-transparent text-ink outline-none placeholder:text-ink-faint disabled:text-ink-faint"
        />
        {suffix != null ? (
          <span aria-hidden="true" className="type-small shrink-0 text-ink-faint">
            {suffix}
          </span>
        ) : null}
      </div>

      {/* Reserved height: a message appearing must never push the rest of the form down. */}
      <p
        id={error != null && error !== "" ? errorId : hintId}
        className={`type-small min-h-5 ${error != null && error !== "" ? "text-cinnabar" : "text-ink-faint"}`}
      >
        {error != null && error !== "" ? error : hint}
      </p>
    </div>
  );
}
