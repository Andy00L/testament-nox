# Testament: UI design system

The single source of truth for every value the interface renders. Components read
tokens, never literals. Anything not in this sheet does not ship; extending the sheet
is a deliberate edit to this file, not a one-off style in a component.

---

## 0. The frame

- **Scope:** the whole front end. Three surfaces: the scene (home), the ritual (write
  and heartbeat), the door (beneficiary and release).
- **Register:** luxury and editorial, crossed with calm trust. Ceremonial, still,
  typographic. References studied for discipline, never for pixels: Aesop (stillness,
  type carrying everything, almost no motion), Apple brand films (one reverent held
  reveal), Wealthsimple (warm field, one accent, restraint as the brand).
- **Density:** narrative and airy on the scene and the door; focused single column with
  one action on the write flow.
- **Hero moment:** the curtain, and the seal pressed onto the panel at signing.
- **Theme scope:** one committed field, dark. This is not "dark mode" with a light
  counterpart missing. The product is a doorway at night; a light theme would describe a
  different object. Recorded here as a deliberate single-theme decision so no future
  session retrofits one.
- **Stack:** Next.js App Router, Bun, Tailwind v4 (tokens as CSS variables in
  `@theme`), Motion for choreography, canvas 2D for the curtain. No second styling
  system, no second component library.

---

## 1. Palette

Warm throughout. The field is aged beam wood at night, deliberately not the
blue-charcoal every dark product ships.

| Role | Token | Value | Where |
| --- | --- | --- | --- |
| Field | `--field` | `#171210` | The page. Lacquer near-black. |
| Field raised | `--field-raised` | `#1F1815` | Panels, the nav, anything one step up. |
| Field sunk | `--field-sunk` | `#100C0B` | Wells, the doorway behind the curtain. |
| Ink | `--ink` | `#EAE0CE` | Primary text. Warm bone. |
| Ink muted | `--ink-muted` | `#9A8F80` | Secondary text, labels. |
| Ink faint | `--ink-faint` | `#6A6157` | Placeholders, disabled, hairlines at strength. |
| Accent | `--brass` | `#C9A227` | The one interactive colour, and the strand material. |
| Accent deep | `--brass-deep` | `#8A6D1F` | The far end of the strand gradient, pressed states. |
| Accent sunk | `--brass-sunk` | `#332A16` | Tonal fill under a focused or active control. |
| Reserved | `--cinnabar` | `#9E2B25` | Irreversibility. Nothing else, ever. |

**The one accent is brass.** It is the material the chimes are made of, so interaction
and the signature artifact speak the same language. It appears as an object colour on
the curtain, and in the interface only as a focus ring, an active hairline, and the
`--brass-sunk` tonal fill. It is never sprayed on type, dots, and fills at once.

**The one reserved colour is cinnabar, and it means "this cannot be undone".** The seal
at signing, the revoke action, the release action. One cinnabar element per screen, at
most. It doubles as the destructive colour on purpose: in this product the irreversible
and the ceremonial are the same thing, so they get one pigment rather than two competing
reds.

Contrast, measured against `--field` `#171210`:

| Pair | Ratio | Floor |
| --- | --- | --- |
| `--ink` on `--field` | 14.1:1 | 4.5:1 body |
| `--ink-muted` on `--field` | 6.7:1 | 4.5:1 body |
| `--ink-faint` on `--field` | 3.4:1 | 3:1 large and non-text only |
| `--brass` on `--field` | 7.4:1 | 4.5:1 body |
| `--ink` on `--field-raised` | 12.4:1 | 4.5:1 body |

`--ink-faint` never carries body copy. It is for hairlines, disabled states, and text at
or above 24px.

---

## 2. Type

| Role | Family | Source |
| --- | --- | --- |
| Display | Gambarino 400 | Fontshare, self-hosted woff2 via `next/font/local` |
| Body and UI | `system-ui` | The genuinely neutral choice, not a trend pick |
| Hanzi | Noto Serif SC 500 | Two-glyph subset, 1276 bytes, only 传 and 承 |
| Numbers | `system-ui` + `tabular-nums` | Addresses, shares, timers, balances |

Gambarino was chosen by rendering all three plan candidates at hero size on the real
headline and looking at the images (`.scratch/type-specimen.png` during the build).
Sentient read as the safe editorial-serif default; Tanker's condensed display weight
belongs to a sports brand, not a will. Gambarino's flared, calligraphic terminals read
engraved and ceremonial, it carries French diacritics correctly, and it is not on the
rejected Google rotation.

Weight ceiling: Gambarino ships one weight (400). Body never exceeds 500. Hierarchy is
size, spacing and colour, never bolding.

Every step sets size, leading and tracking together.

| Step | Size | Leading | Tracking | Family |
| --- | --- | --- | --- | --- |
| `display-hero` | `clamp(2.75rem, 2rem + 3.6vw, 4.75rem)` | 1.06 | -0.02em | Gambarino |
| `display-lg` | `clamp(1.875rem, 1.5rem + 1.9vw, 2.75rem)` | 1.12 | -0.015em | Gambarino |
| `title` | `1.375rem` | 1.25 | -0.01em | Gambarino |
| `body` | `1rem` | 1.6 | 0 | system-ui |
| `small` | `0.875rem` | 1.5 | 0.005em | system-ui |
| `label` | `0.75rem` | 1 | 0.14em, uppercase | system-ui |

**The `label` step has exactly one job: naming a field in the write panel.** It is not
the eyebrow, not the button text, not the footer, not the nav. Every small string
wearing the same tracked-caps costume is its own tell, so other small text uses `small`
at `--ink-muted` and earns its rank from position and colour.

Headlines hold to one or two lines, never three. Emphasis inside a headline is a value
shift, never a coloured word, and never a coloured word stranded at the end of a wrap.

**Wordmark:** "Testament" set in Gambarino, sentence case, normal tracking, beside the
seal mark at 18px. Not letterspaced caps: an all-caps serif tracked out is the stock
luxury logo move and reads as a template.

---

## 3. Space and shape

- Spacing base 4px. The rhythm runs 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96.
- Radii: `2` (controls, chips), `4` (panels), `999` (the seal and the strand beads only).
  This is a world of lacquered wood and pressed paper; soft corners would make it
  plastic. Inner radius always smaller than its parent's.
- Content width 1120px, text measure capped at 62ch, side padding 24px mobile / 40px
  desktop.
- Panel padding 24px mobile / 32px desktop.

---

## 4. Material: lacquer, not glass

One material, one recipe, one light source, from directly above.

```css
--lacquer-surface: linear-gradient(180deg, #221A17 0%, #1B1512 100%);
--lacquer-lip: inset 0 1px 0 rgba(234, 224, 206, 0.07);   /* the light catches the top edge */
--lacquer-ring: inset 0 0 0 1px rgba(234, 224, 206, 0.06); /* self-coloured edge, not a drawn line */
--lacquer-cast:
  0 1px 2px rgba(8, 5, 4, 0.5),
  0 14px 34px rgba(8, 5, 4, 0.34);
```

The edge is self-coloured and low-opacity, so it reads as a rounded lip catching light
rather than a hairline border drawn around a box. The shadow is tinted with the field's
own darkest value, never pure black, and is directional, never a symmetric halo. Panels
never nest on panels: a well inside a panel uses `--field-sunk` with the ring only and
no cast.

**Grain** sits at 4% opacity on the field, animated in steps, and always **behind**
content. It never overlays text, the canvas, or a control.

---

## 5. Motion tokens

| Token | Value | Job |
| --- | --- | --- |
| `--dur-micro` | 90ms | Colour and opacity state changes |
| `--dur-small` | 160ms | Hover and focus treatments |
| `--dur-standard` | 240ms | Panel and route transitions |
| `--dur-large` | 380ms | The seal press, the door opening |
| `--ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | Anything arriving |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Anything leaving, one step shorter |
| `--ease-standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | On-screen moves |
| `--stagger` | 45ms | The one stagger constant, everywhere |

Press scale 0.98, never lower. One overshoot budget, spent only on the seal landing.
Enters decelerate, exits accelerate and run about 20% shorter. No bare crossfade: every
fade carries a small transform.

The curtain is the one continuous exception. It is physics, not a keyframe, so it has no
duration token; its constants live in `scene/constants.ts` and are documented there.

---

## 6. The signature

**One artifact: the curtain.** A full-viewport canvas of hanging Verlet chains, 40
strands on desktop and 24 on mobile, pinned under a hand-drawn eave, with brass beads
along each strand. The pointer is wind. The scene's colour and breeze are driven by the
live testament state, so the artifact is also the status display: warm brass and a lively
breeze while the heartbeat is recent, desaturating toward cold iron as the silence runs
on, strands detaching and falling once released. There is no countdown widget anywhere in
this product; the curtain is the countdown.

**One bespoke silhouette: the seal.** A cinnabar stamp with a deliberately imperfect
edge, drawn as SVG, pressed onto the panel at the moment of signing. Placement rule: at
most one seal per screen, only on an irreversible action, always at the point of
commitment.

Everything else in the interface is quiet so these two land.

---

## 7. House style, in one line

A lacquered door at night: still, warm, and ceremonial, where the only thing that moves
is the wind you are still sending.
