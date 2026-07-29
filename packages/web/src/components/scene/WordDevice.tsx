"use client";

import { useTranslation } from "@/components/i18n/LanguageProvider";

/**
 * 传承, chuánchéng: what is passed on.
 *
 * Hung on the wall behind the curtain, set vertically the way a 对联 scroll flanks a
 * doorway, so the strands cross in front of it and the page has a real z-axis instead of
 * one flat plane. The gloss sits in front, at the scroll's foot.
 */
export function WordDevice() {
  const { copy } = useTranslation();

  return (
    <div className="anim-rise anim-d-5 pointer-events-none flex flex-col items-end gap-5">
      <div className="anim-hang flex flex-col items-end gap-5">
      <p
        aria-hidden="true"
        className="font-(family-name:--font-hanzi) text-ink"
        style={{
          writingMode: "vertical-rl",
          fontSize: "clamp(4.5rem, 10vw, 9rem)",
          lineHeight: 1,
          letterSpacing: "0.08em",
          fontWeight: 500,
          opacity: 0.2,
        }}
      >
        传承
      </p>
      <div className="pointer-events-auto text-right">
        <p className="type-small text-ink" lang="zh-Latn">
          {copy.word.pinyin}
        </p>
        <p className="type-small text-ink-muted">{copy.word.gloss}</p>
      </div>
      </div>
    </div>
  );
}
