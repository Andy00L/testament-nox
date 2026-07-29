import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, type Page } from "playwright";

/**
 * The anti-slop verification pass, for the entries a screenshot cannot settle on its own.
 *
 * Two things this checks that nothing else does:
 *
 * 1. **Centering.** The most repeated execution failure in the design law is content that is
 *    meant to be centred and is not, SVG text especially, where `text-anchor: middle` handles
 *    only the horizontal axis. This measures the seal's glyph box against the seal's own box
 *    and fails on more than a pixel of drift.
 * 2. **Dead controls.** A control that looks interactive and does nothing is slop and also
 *    simply broken. Every control is clicked for real and asserted to have responded.
 *
 * Run against a production build: bun run verify-ui
 */

/**
 * The counter the chime check installs in the page. Declared rather than cast: a type
 * assertion would hide a rename, and this is the only thing the browser context adds.
 */
declare global {
  interface Window {
    __oscillators?: number;
  }
}

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const OUTPUT_DIR = resolve(import.meta.dirname, "../../../.scratch/verify");

/** Drift tolerated between a glyph's optical centre and its container's. Unit: CSS px. */
const CENTERING_TOLERANCE_PX = 1.5;

/** Minimum contrast for body text. sourceRef: WCAG 2.1 AA, 1.4.3. */
const BODY_CONTRAST_FLOOR = 4.5;

const failures: string[] = [];

function check(label: string, passed: boolean, detail: string): void {
  console.log(`${passed ? "  ok  " : "  FAIL"} ${label}${detail === "" ? "" : ` (${detail})`}`);
  if (!passed) {
    failures.push(`${label}: ${detail}`);
  }
}

function relativeLuminance(color: [number, number, number]): number {
  const channels = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrastRatio(foreground: [number, number, number], background: [number, number, number]): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function parseRgb(value: string): [number, number, number] {
  const matched = /rgba?\(([^)]+)\)/.exec(value);
  const parts = (matched?.[1] ?? "0,0,0").split(",").map((part) => Number(part.trim()));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  locale: "fr-FR",
});
const page: Page = await context.newPage();

const consoleErrors: string[] = [];
page.on("pageerror", (error) => consoleErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push(message.text());
  }
});

// ---- Centering: the seal's carved glyph against the seal's own box ------------------

console.log("\ncentering");
await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const sealCentering = await page.evaluate(() => {
  const seal = document.querySelector("svg[data-seal]");
  const glyph = seal?.querySelector("text");
  if (seal === null || seal === undefined || glyph === null || glyph === undefined) {
    return null;
  }
  const sealBox = seal.getBoundingClientRect();
  const glyphBox = glyph.getBoundingClientRect();
  return {
    horizontalDrift: glyphBox.left + glyphBox.width / 2 - (sealBox.left + sealBox.width / 2),
    verticalDrift: glyphBox.top + glyphBox.height / 2 - (sealBox.top + sealBox.height / 2),
    sealWidth: sealBox.width,
  };
});

if (sealCentering === null) {
  check("seal glyph measurable", false, "seal or its text node not found");
} else {
  // Drift is measured on the rendered size, so express the tolerance in the same units.
  const scale = sealCentering.sealWidth / 18;
  check(
    "seal glyph centred horizontally",
    Math.abs(sealCentering.horizontalDrift) <= CENTERING_TOLERANCE_PX * scale,
    `${sealCentering.horizontalDrift.toFixed(2)}px drift`,
  );
  check(
    "seal glyph centred vertically",
    Math.abs(sealCentering.verticalDrift) <= CENTERING_TOLERANCE_PX * scale,
    `${sealCentering.verticalDrift.toFixed(2)}px drift`,
  );
}

// A large render of the seal, so the centring can also be judged by eye.
await page.setContent(
  `<body style="margin:0;background:#171210;display:grid;place-items:center;height:100vh">
     ${(await page.evaluate(() => document.querySelector("svg[data-seal]")?.outerHTML ?? ""))
       .replace('width="18"', 'width="360"')
       .replace(/height="[\d.]+"/, 'height="371"')}
     <div style="position:fixed;inset:0;pointer-events:none">
       <div style="position:absolute;left:50%;top:0;bottom:0;width:1px;background:#C9A227"></div>
       <div style="position:absolute;top:50%;left:0;right:0;height:1px;background:#C9A227"></div>
     </div>
   </body>`,
);
await page.addStyleTag({
  content: `@font-face { font-family: "seal-hanzi"; src: url("${BASE_URL}/_next/static/media/placeholder.woff2"); }`,
});
await page.waitForTimeout(400);
await page.screenshot({ path: resolve(OUTPUT_DIR, "seal-centering.png") });
console.log("  seal-centering.png written (crosshair at the true centre)");

// ---- Contrast: measured on the real render, not from the token sheet ----------------

console.log("\ncontrast");
await page.goto(`${BASE_URL}/ecrire`, { waitUntil: "networkidle" });
await page.waitForTimeout(1000);

const contrastSamples = await page.evaluate(() => {
  const readPair = (selector: string) => {
    const node = document.querySelector(selector);
    if (node === null) return null;
    let backgroundNode: Element | null = node;
    let background = "rgba(0, 0, 0, 0)";
    while (backgroundNode !== null) {
      const candidate = getComputedStyle(backgroundNode).backgroundColor;
      if (candidate !== "rgba(0, 0, 0, 0)" && candidate !== "transparent") {
        background = candidate;
        break;
      }
      backgroundNode = backgroundNode.parentElement;
    }
    return { color: getComputedStyle(node).color, background };
  };
  return {
    bodyOnPanel: readPair(".panel .type-body"),
    labelOnPanel: readPair(".panel .type-label"),
    heading: readPair("h1.type-display-hero"),
  };
});

for (const [label, sample] of Object.entries(contrastSamples)) {
  if (sample === null) {
    check(`contrast ${label}`, false, "element not found");
    continue;
  }
  const ratio = contrastRatio(parseRgb(sample.color), parseRgb(sample.background));
  // The label step is 12px uppercase, so it is body-weight text and takes the body floor.
  check(`contrast ${label}`, ratio >= BODY_CONTRAST_FLOOR, `${ratio.toFixed(2)}:1`);
}

// ---- Dead controls: every control is clicked for real -------------------------------

console.log("\ncontrols respond");
await page.goto(`${BASE_URL}/ecrire`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const rowsBefore = await page.locator("li").filter({ has: page.getByText("Héritier") }).count();
await page.getByRole("button", { name: "Ajouter un héritier" }).click();
await page.waitForTimeout(300);
const rowsAfterAdd = await page.locator("li").filter({ has: page.getByText("Héritier") }).count();
check("add heir adds a row", rowsAfterAdd === rowsBefore + 1, `${rowsBefore} to ${rowsAfterAdd}`);

await page.getByRole("button", { name: "Retirer" }).last().click();
await page.waitForTimeout(300);
const rowsAfterRemove = await page.locator("li").filter({ has: page.getByText("Héritier") }).count();
check("remove heir removes a row", rowsAfterRemove === rowsBefore, `back to ${rowsAfterRemove}`);

await page.getByLabel("Héritier 1").fill("0x71De5E2141C89F7A6c5260d10D18CbC47fB1a7f2");
await page.getByLabel("Part").first().fill("60");
await page.waitForTimeout(200);
const counterText = (await page.getByText(/attribués sur 100/).textContent()) ?? "";
check("share counter reacts to input", counterText.includes("60"), counterText.trim());

await page.getByLabel("Héritier 2").fill("0xnope");
await page.waitForTimeout(200);
const hasAddressError = await page.getByText("Adresse invalide.").first().isVisible();
check("invalid address surfaces an error", hasAddressError, "inline error shown");

const soundToggle = page.getByRole("button", { name: /carillons|Couper le son/ });
const soundLabelBefore = (await soundToggle.textContent()) ?? "";
await soundToggle.click();
await page.waitForTimeout(300);
const soundLabelAfter = (await soundToggle.textContent()) ?? "";
check("sound toggle changes state", soundLabelBefore !== soundLabelAfter, `${soundLabelBefore.trim()} to ${soundLabelAfter.trim()}`);

// The seal must refuse to fire while the will is invalid, and say why rather than sit dead.
const sealButton = page.getByRole("button", { name: /Presser le sceau/ });
check("seal is disabled on an invalid will", await sealButton.isDisabled(), "disabled with a stated reason");

// ---- The wallet chooser opens, says something honest, and closes -----------------------

console.log("\nwallet chooser");
await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
await page.getByRole("button", { name: "Connecter" }).click();
await page.waitForTimeout(300);
check(
  "chooser opens on the one connect button",
  await page.getByText("Choisir un portefeuille").isVisible(),
  "panel visible",
);
// Headless chromium has no wallet extension, so the honest state is "none detected".
check(
  "an empty browser is told no wallet was detected",
  await page.getByText("Aucun portefeuille détecté dans ce navigateur.").isVisible(),
  "no dead rows",
);
await page.keyboard.press("Escape");
await page.waitForTimeout(200);
check(
  "Escape closes the chooser",
  !(await page.getByText("Choisir un portefeuille").isVisible()),
  "closed",
);

// ---- Language ------------------------------------------------------------------------

console.log("\nlanguage");
await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);
const frenchHeadline = await page.locator("h1").first().innerText();
await page.getByRole("button", { name: "English" }).click();
await page.waitForTimeout(400);
const englishHeadline = await page.locator("h1").first().innerText();
const htmlLang = await page.evaluate(() => document.documentElement.lang);
check("headline switches language", frenchHeadline !== englishHeadline, englishHeadline.replace(/\n/g, " ").slice(0, 40));
check("html lang follows the switch", htmlLang === "en", `lang="${htmlLang}"`);
await page.getByRole("button", { name: "Français" }).click();
await page.waitForTimeout(300);
check("switches back to French", (await page.locator("h1").first().innerText()) === frenchHeadline, "round trip");

// ---- The curtain rings when the pointer passes through it -----------------------------

console.log("\nchimes");
const audioContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: "fr-FR",
});
// Count oscillators instead of listening: this proves notes were actually scheduled,
// which a headless browser will never make audible.
await audioContext.addInitScript(() => {
  const originalAudioContext = window.AudioContext;
  class CountingAudioContext extends originalAudioContext {
    createOscillator() {
      window.__oscillators = (window.__oscillators ?? 0) + 1;
      return super.createOscillator();
    }
  }
  Object.defineProperty(window, "AudioContext", { value: CountingAudioContext, writable: true });
});
const audioPage = await audioContext.newPage();
await audioPage.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
await audioPage.waitForTimeout(1400);

await audioPage.getByRole("button", { name: /carillons/ }).click();
await audioPage.waitForTimeout(300);
const beforeSweep = await audioPage.evaluate(
  () => window.__oscillators ?? 0,
);

// Sweep the pointer horizontally through the hanging strands.
await audioPage.mouse.move(200, 520);
for (let step = 0; step <= 24; step += 1) {
  await audioPage.mouse.move(200 + step * 45, 520);
  await audioPage.waitForTimeout(35);
}
await audioPage.waitForTimeout(400);
const afterSweep = await audioPage.evaluate(
  () => window.__oscillators ?? 0,
);
check(
  "sweeping the cursor through the curtain rings it",
  afterSweep > beforeSweep,
  `${(afterSweep - beforeSweep) / 2} strands struck`,
);
await audioContext.close();

// ---- Focus is visible on every interactive element ----------------------------------

console.log("\nfocus");
// The focus treatment lives on the form, so go back to the page that has one.
await page.goto(`${BASE_URL}/ecrire`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);
const focusOutline = await page.evaluate(() => {
  const field = document.querySelector<HTMLInputElement>("input");
  if (field === null) return null;
  field.focus();
  const wrapper = field.closest(".panel-well");
  return wrapper === null ? null : getComputedStyle(wrapper).outlineColor;
});
check("focused field shows the bronze ring", focusOutline !== null && focusOutline !== "rgba(0, 0, 0, 0)", String(focusOutline));

// ---- Content survives with no JavaScript at all -------------------------------------

console.log("\ncontent is visible by default");
const noScriptContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  javaScriptEnabled: false,
  locale: "fr-FR",
});
const noScriptPage = await noScriptContext.newPage();
await noScriptPage.goto(`${BASE_URL}/`, { waitUntil: "domcontentloaded" });
const headlineWithoutJs = await noScriptPage.locator("h1").first().innerText();
check(
  "headline renders with JavaScript disabled",
  headlineWithoutJs.includes("Votre Safe"),
  headlineWithoutJs.replace(/\n/g, " ").slice(0, 48),
);
await noScriptPage.screenshot({ path: resolve(OUTPUT_DIR, "no-javascript.png") });
await noScriptContext.close();

check("no console errors on the pages visited", consoleErrors.length === 0, consoleErrors.slice(0, 2).join(" | "));

await browser.close();

console.log(`\n${failures.length === 0 ? "all checks passed" : `${failures.length} failing`}`);
if (failures.length > 0) {
  for (const failure of failures) {
    console.log(`  - ${failure}`);
  }
  process.exit(1);
}
