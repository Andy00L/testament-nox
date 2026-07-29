import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium, type Page } from "playwright";

/**
 * The screenshot gate.
 *
 * Renders every screen and every state that matters at 2x, so the design review happens
 * against images rather than against memory. Nothing here touches the chain: the states
 * that need a wallet are driven by filling the real controls.
 *
 * Run against a production build, not `next dev`: in some WSL setups the Turbopack HMR
 * socket never completes its handshake and the page then never hydrates, so the canvas
 * stays blank and every shot lies.
 *
 *   bun run build && bunx next start -p 3100
 *   bun run shots
 */

const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const OUTPUT_DIR = resolve(import.meta.dirname, "../../../.scratch/shots");

/** Everything is shot at 2x so type rendering can actually be judged. */
const DEVICE_SCALE_FACTOR = 2;

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
] as const;

/** Long enough for the curtain to settle and the fonts to land before the shutter. */
const SETTLE_MS = 1400;

async function capture(page: Page, fileName: string): Promise<void> {
  await page.waitForTimeout(SETTLE_MS);
  await page.screenshot({ path: resolve(OUTPUT_DIR, `${fileName}.png`), fullPage: false });
  console.log(`[shoot] ${fileName}.png`);
}

mkdirSync(OUTPUT_DIR, { recursive: true });

const browser = await chromium.launch();

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    locale: "fr-FR",
  });
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
  await capture(page, `scene-${viewport.name}`);

  // The pointer is wind: this is the curtain parting, not a hover state on a control.
  await page.mouse.move(viewport.width * 0.42, viewport.height * 0.5);
  await page.mouse.move(viewport.width * 0.58, viewport.height * 0.55, { steps: 12 });
  await capture(page, `scene-wind-${viewport.name}`);

  await page.goto(`${BASE_URL}/ecrire`, { waitUntil: "networkidle" });
  await capture(page, `write-${viewport.name}`);

  // A filled form, at realistic address lengths, with the validation actually triggered.
  await page.getByLabel("Héritier 1").fill("0x71De5E2141C89F7A6c5260d10D18CbC47fB1a7f2");
  await page.getByLabel("Héritier 2").fill("0xe5aFeC35193B23B3AFD1B2C74613598714D5F484");
  const shareFields = page.getByLabel("Part");
  await shareFields.nth(0).fill("60");
  await shareFields.nth(1).fill("40");
  await page.getByLabel("Adresse du Safe").fill("0x1F7481b60669d09404cf2b2493Cc6D7FE3155b8F");
  await capture(page, `write-filled-${viewport.name}`);

  // The error state, triggered for real rather than assumed from the code.
  await page.getByLabel("Héritier 1").fill("0xnot-an-address");
  await capture(page, `write-error-${viewport.name}`);

  // Focus, so the one focus treatment can be judged on the material.
  await page.getByLabel("Adresse du Safe").focus();
  await capture(page, `write-focus-${viewport.name}`);

  await page.goto(`${BASE_URL}/porte`, { waitUntil: "networkidle" });
  await capture(page, `door-${viewport.name}`);

  await context.close();
}

// Reduced motion: the composition must be identical, only stiller.
const reducedContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: DEVICE_SCALE_FACTOR,
  locale: "fr-FR",
  reducedMotion: "reduce",
});
const reducedPage = await reducedContext.newPage();
await reducedPage.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
await capture(reducedPage, "scene-reduced-motion");
await reducedContext.close();

await browser.close();
console.log(`[shoot] wrote to ${OUTPUT_DIR}`);
