/**
 * 传承, chuánchéng: what is passed on.
 *
 * Hung on the wall behind the curtain, set vertically the way a 对联 scroll flanks a
 * doorway, so the strands cross in front of it and the page has a real z-axis instead of
 * one flat plane. The gloss sits in front, at the scroll's foot.
 */
export function WordDevice() {
  return (
    <div className="pointer-events-none flex flex-col items-end gap-5">
      <p
        aria-hidden="true"
        className="font-(family-name:--font-hanzi) text-ink"
        style={{
          writingMode: "vertical-rl",
          fontSize: "clamp(5.5rem, 12vw, 11rem)",
          lineHeight: 1,
          letterSpacing: "0.08em",
          fontWeight: 500,
          opacity: 0.62,
        }}
      >
        传承
      </p>
      <div className="pointer-events-auto text-right">
        <p className="type-small text-ink" lang="zh-Latn">
          chuánchéng
        </p>
        <p className="type-small text-ink-muted">ce qui se transmet</p>
      </div>
    </div>
  );
}
