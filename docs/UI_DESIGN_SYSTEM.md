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
- **No homework:** nothing this product can compute is asked of its author. The vault address
  is one of those: `createProxyWithNonce` deploys with CREATE2, so a wallet's Safe address is
  arithmetic, and the field fills itself the moment a wallet connects, before the Safe exists
  and with no backend to ask. Creating it and funding it are offered in the same place, and the
  field stays editable for an owner who already keeps a Safe elsewhere.
- **Theme scope:** one committed field, light. Woven tatami under warm daylight. This is
  not "light mode" with a dark counterpart missing: the product is a doorway you stand in
  during the day. Recorded here as a deliberate single-theme decision so no future session
  retrofits one.
- **Languages:** French and English, one typed dictionary at `src/lib/i18n.ts` where
  `english` is typed as `typeof french`, so a string added to one language and forgotten in
  the other fails the build.
- **Stack:** Next.js App Router, Bun, Tailwind v4 (tokens as CSS variables in
  `@theme`), Motion for choreography, canvas 2D for the curtain. No second styling
  system, no second component library.

---

## 1. Palette

Warm throughout. The field is a woven rush mat under daylight, deliberately not the
cream-and-white every editorial template ships: the texture, not the tint, carries it.

| Role | Token | Value | Where |
| --- | --- | --- | --- |
| Field | `--color-field` | `#F3E8D5` | The mat, under the woven texture. |
| Field raised | `--color-field-raised` | `#FFFDF7` | Panels and the plaque. Cream paper. |
| Field sunk | `--color-field-sunk` | `#E8DFD0` | Wells and inputs. |
| Field warm | `--color-field-warm` | `#F0E9DC` | One value step between sunk and paper: a key held down. |
| Ink | `--color-ink` | `#3A2D2A` | Primary text. |
| Ink muted | `--color-ink-muted` | `#58423C` | Secondary text, labels. |
| Ink faint | `--color-ink-faint` | `#6F5C57` | Placeholders, disabled, hints. Never body copy. |
| Accent | `--color-bronze` | `#8A6D1F` | The one interactive colour, and the strand material. |
| Accent deep | `--color-bronze-deep` | `#5E4A14` | The far end of the strand gradient. |
| Accent sunk | `--color-bronze-sunk` | `#EFE4C6` | Tonal fill under a charging control. |
| Reserved | `--color-cinnabar` | `#9E2B25` | Irreversibility. Nothing else, ever. |
| Iron | `--color-iron` | `#BDB3A8` | Strands once the wind falls: they fade into the mat. |

The ink values come from Marina Budarina's chimes stylesheet (`--ink: #58423c`,
`--ink-strong: #3a2d2a`), so the drawn interface and her photographic tatami and roof sit in
one colour world rather than two. Her artwork is used with permission; see the README.

**The one accent is bronze.** It is the material the chimes are made of, so interaction
and the signature artifact speak the same language. It appears as an object colour on the
curtain, and in the interface only as a focus ring, a hover state, and the
`--color-bronze-sunk` tonal fill. It is never sprayed on type, dots, and fills at once.

**The one reserved colour is cinnabar, and it means "this cannot be undone".** The seal
at signing, the revoke action, the release action. One cinnabar element per screen, at
most. It doubles as the destructive colour on purpose: in this product the irreversible
and the ceremonial are the same thing, so they get one pigment rather than two competing
reds.

Contrast is measured on the rendered page rather than computed from the sheet, by
`bun run --cwd packages/web verify-ui`, which fails the build below 4.5:1. Current readings:

| Pair | Ratio | Floor |
| --- | --- | --- |
| body copy on a panel | 7.66:1 | 4.5:1 |
| field label on a panel | 7.66:1 | 4.5:1 |
| display heading on the mat | 10.90:1 | 4.5:1 |
| hint under a field | 5.18:1 | 4.5:1 |

`--color-ink-faint` never carries body copy. It is for hints, disabled states, and
placeholder text.

**Faint ink was measured and moved.** It used to be `#9A8A84`, which renders at 2.51:1 on a
well and 2.73:1 on the mat: under even the 3:1 large-text floor. Live testing reported the
quiet half of this interface as barely visible, and it was right. `#6F5C57` holds 4.75:1 on a
well, 5.18:1 on the mat and 6.17:1 on paper in the same warm family, so faint still reads as
faint and now also reads. The gate missed it because it only sampled body, label and heading;
`verify-ui` now measures the hint under a field too, which is where meaning actually lives
(which consent is missing, whether the vault is empty).

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
| `display-hero` | `clamp(2.25rem, 1.1rem + 4.2vw, 4.5rem)` | 1.06 | -0.02em | Gambarino |
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
shift, never a coloured word, and never a coloured word stranded at the end of a wrap. The
hero ramp is set so that promise survives contact with a real column: the previous one was
steep enough that each of the home page's two authored lines wrapped again on a laptop and the
fold opened on a four-line staircase.

**Small text carries a relief.** `type-small` and `type-label` set
`text-shadow: 0 1px 0 var(--relief-catch)`: one hairline of the paper's own highlight under the
glyph, on the same light everything else here is lit by (from above, so the catch sits below
the stroke, exactly as `--panel-lip` does on a panel edge). It is what pressed ink does to
paper, and it buys the edge definition 14px type needs over a woven mat. No blur, no sideways
offset, no dark halo: a legibility shadow, never a decorative one.

**Wordmark:** "Testament" set in Gambarino, sentence case, normal tracking, beside the
seal mark at 18px. Not letterspaced caps: an all-caps serif tracked out is the stock
luxury logo move and reads as a template.

---

## 3. Space and shape

- Spacing base 4px. The rhythm runs 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96.
- Radii: `2` (controls, chips), `4` (panels), `999` (the seal and the strand beads only).
  This is a world of pressed paper and painted timber; soft corners would make it plastic.
  Inner radius always smaller than its parent's.
- Content width 1120px, text measure capped at 62ch, side padding 24px mobile / 40px
  desktop.
- Panel padding 24px mobile / 32px desktop.

---

## 4. Material: paper on the mat

One material, one recipe, one light source, from above and slightly front.

```css
--panel-surface: linear-gradient(180deg, #fffdf7 0%, #fdf7ea 100%);
--panel-lip: inset 0 1px 0 rgba(255, 255, 255, 0.9);      /* the light catches the top edge */
--panel-ring: inset 0 0 0 1px rgba(88, 66, 60, 0.10);      /* self-coloured edge, not a drawn line */
--panel-cast:
  0 1px 2px rgba(58, 45, 42, 0.06),
  0 12px 28px rgba(58, 45, 42, 0.10);
```

The edge is self-coloured and low-opacity, so it reads as a rounded lip catching light
rather than a hairline border drawn around a box. The shadow is tinted with the field's
own darkest value, never pure black, and is directional, never a symmetric halo. Panels
never nest on panels: a well inside a panel uses `--color-field-sunk` with an inset ring
and no cast.

**Sunk means you write into it, proud means you press it.** This is the one distinction the
system was missing, and its absence is what live testing found: a field and a button were the
same carved recess, so nothing announced itself as pressable and pressing produced no before
and after. Fields stay wells (`.panel-well`). Every control is a key (`.key`): the same paper,
standing proud of the panel on a tight directional cast, that goes flush when pressed. The cast
disappears, the lip inverts into a recess, the fill warms to `--color-field-warm` and the label
travels one pixel down with it. Rest, hover and press are three readings you can tell apart
from a still image, which is the bar. A refused control is sunk from the start, so it never
looked pressable in the first place.

The seal keeps its own recess, because the stone goes into it rather than standing on it:
hovering lifts the stone off the floor, pressing puts it back down. Same physics, one control's
own version of it.

**Cursors are declared.** Tailwind v4's preflight sets `appearance: button`, and browsers then
hand every button the arrow cursor. Almost every control here is a button, so a base rule gives
them the hand and gives a disabled one `not-allowed`. Without it the whole interface reads as
unclickable on hover, which is exactly how it was reported.

**Texture** comes from the tatami itself, a fixed woven substrate behind everything, plus
one very soft radial that brightens the mat toward the doorway and lets it fall into shade
at the corners. No separate grain layer is stacked on top: one texture, not two, and it
never crosses text or a control.

---

## 5. Motion tokens

Two layers. The interaction layer (hover, focus, colour) keeps the original house
tokens; the choreography layer (entrances, dropdown, swaps, shake) adopts the
transitions.dev scale wholesale, so every recipe from that library drops in without
translation.

Interaction layer:

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

Choreography layer (transitions.dev scale, in `globals.css`):

| Token | Value | Job |
| --- | --- | --- |
| `--duration-stagger` | 40ms | Per-item offset in list staggers |
| `--duration-micro` | 80ms | Entrance stagger steps (`.anim-d-1` to `.anim-d-6`) |
| `--duration-quick` | 150ms | Closes, exits, text swaps |
| `--duration-fast` | 250ms | Opens, list-row entrances |
| `--duration-medium` | 350ms | Section entrances (`rise-in`) |
| `--duration-slow` | 400ms | Roof settle |
| `--duration-very-slow` | 500ms | Plaque drop |
| `--ease-smooth-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Every choreography move |
| `--distance-*` | 4 / 6 / 8 / 12 / 30px | Travel per element size |
| `--scale-tiny` / `--scale-medium` | 0.99 / 0.97 | Pre-scales for pops and panels |
| `--blur-small` / `--blur-medium` | 2 / 3px | Entrance blur on text swaps |

Rules carried over from that scale: open and close are asymmetric (open 250ms, close
150ms, and a close is never delayed); hover-out may run shorter than hover-in; the
scroll unroll (700ms clip-path) is the single budgeted exception above `--duration-very-slow`.
Entrances are pure CSS keyframes with `animation-fill-mode: both`, so content is present
without JavaScript and `prefers-reduced-motion` kills all of it globally.

Press scale 0.98, never lower. One overshoot budget, spent only on the seal landing.
Enters decelerate, exits accelerate and run about 20% shorter. No bare crossfade: every
fade carries a small transform.

The curtain is the one continuous exception. It is physics, not a keyframe, so it has no
duration token; its constants live in `scene/constants.ts` and are documented there.

---

## 6. The signature

**One artifact: the curtain.** A full-viewport canvas of hanging Verlet chains, 40
strands on desktop and 24 on mobile, pinned under the painted roof band, with bronze beads
along each strand. The pointer is wind. The scene's colour and breeze are driven by the
live testament state, so the artifact is also the status display: warm bronze and a lively
breeze while the heartbeat is recent, desaturating toward cold iron as the silence runs
on, strands detaching and falling once released. There is no countdown widget anywhere in
this product; the curtain is the countdown.

**Four carved frames, mounted rather than drawn.** `public/frames/` holds four painted
objects the interface mounts live controls inside: the two-slot legacy plaque (the home page's two
doors: write a testament, or arrive as an heir), the heir envelope (one per heir, stacked into a pile), the zodiac dial
(the countdown while the author is alive) and the opened fan (the same countdown, public, on
the door). Every window in them was measured off the shipped WebP by flood-filling its alpha
channel, and those measurements live as percentages in `components/frames/CarvedFrame.tsx`.
Content is positioned in percent of the frame's own box and sized in `cqw` against it, so a
window that contains its content at 1200px contains it at 320px. Re-measure if the art is
ever replaced. Sources are gitignored; regenerate the WebP with
`bun run --cwd packages/web scripts/optimise-scene-assets.ts`.

**The countdown now has a widget, deliberately.** This sheet used to say there was none and
that the curtain was the countdown. Testing reversed it: the curtain reads as mood, not as a
figure, and the remaining silence was going unread as the opening clause of a muted sentence.
The curtain is still the signature and still carries the state; the dial and the fan carry the
number. One reading each, and they cannot disagree because both come from the same summary.

**One bespoke silhouette: the seal.** A cinnabar stamp with a deliberately imperfect
edge, drawn as SVG, pressed onto the panel at the moment of signing. Placement rule: at
most one seal per screen, only on an irreversible action, always at the point of
commitment.

**One geometry, on every key: the chamfered corner.** The key is cut top-left and
bottom-right, the 委角 of a lacquer panel, so this product's pressable things share a shape no
component kit ships. It is one polygon in `globals.css`, applied to the key's surface and to
anything inlaid into it (`.key-inlay`, for the heartbeat charge and the copy wash) so the cut
never disagrees with itself. The cast is a `drop-shadow` filter rather than a `box-shadow`,
because a shadow has to follow a cut silhouette; the handscroll and the carved frames do the
same for the same reason.

**The Safe mark, where a Safe is named.** `components/ui/SafeMark.tsx` carries Safe's own
glyph, taken verbatim from their brand asset and cropped to the mark, rendered in
`currentColor` and bare. It appears beside the vault field's label, and only while that field
holds the address this product derived. Nothing is redrawn and nothing sits in a tile behind
it.

Everything else in the interface is quiet so these two land.

---

## 7. House style, in one line

A doorway at midday under a painted roof: still, warm, and ceremonial, where the only
thing that moves is the wind you are still sending.
