"use client";

import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

/**
 * The one pressable surface, as a component.
 *
 * `.key` in globals.css is the material (paper standing proud of the panel, pressed flush);
 * this wraps it so every key also carries the sheen layer, the specular band that crosses the
 * surface once on hover. The band has to travel inside a chamfer that stands still, which
 * takes a real child element (see the `.key-sheen` comment in globals.css), and seven call
 * sites each hand-writing that span is how one of them forgets it.
 *
 * A passthrough otherwise: whatever a native button takes, a Key takes.
 */

type KeyProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
};

export function Key({ children, className, type, ...buttonProps }: KeyProps) {
  return (
    <button {...buttonProps} type={type ?? "button"} className={`key ${className ?? ""}`}>
      <span aria-hidden="true" className="key-sheen" />
      {children}
    </button>
  );
}
