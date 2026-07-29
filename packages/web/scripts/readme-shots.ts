import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "playwright";
import sharp from "sharp";

/**
 * The three screenshots the README embeds.
 *
 * Shot at device scale 1 rather than the 2x used for design review, then encoded as WebP:
 * a README image has to stay under about 500KB so the page loads on bad wifi, and the
 * photographic tatami and roof push a PNG past 2MB on their own. 1440px wide at 1x is still
 * inside the 1280 to 1600 range a reader is looking at.
 *
 * Run against a production build: bun run readme-shots
 */
const BASE_URL = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const OUTPUT_DIR = resolve(import.meta.dirname, "../../../docs/screenshots");

mkdirSync(OUTPUT_DIR, { recursive: true });

/** Screenshots straight to WebP, so nothing multi-megabyte ever reaches the README. */
async function capture(target: Awaited<ReturnType<typeof browserContext.newPage>>, name: string) {
  const png = await target.screenshot();
  const outputPath = resolve(OUTPUT_DIR, `${name}.webp`);
  await sharp(png).webp({ quality: 76, effort: 6 }).toFile(outputPath);
  console.log(`[readmeShots] ${name}.webp`);
}

const browser = await chromium.launch();
const browserContext = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  locale: "fr-FR",
});
const page = await browserContext.newPage();

await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
await page.mouse.move(620, 430);
await page.mouse.move(760, 470, { steps: 14 });
await page.waitForTimeout(1800);
await capture(page, "01-scene");

await page.goto(`${BASE_URL}/ecrire`, { waitUntil: "networkidle" });
await page.getByLabel("Héritier 1").fill("0x71De5E2141C89F7A6c5260d10D18CbC47fB1a7f2");
await page.getByLabel("Héritier 2").fill("0xe5aFeC35193B23B3AFD1B2C74613598714D5F484");
const shares = page.getByLabel("Part");
await shares.nth(0).fill("60");
await shares.nth(1).fill("40");
await page.getByLabel("Adresse du Safe").fill("0x4c67A14075e451651B81D2E6f2038a7d1d007192");
await page.mouse.move(1200, 500);
await page.waitForTimeout(1500);
await capture(page, "02-write");

// The door reading a real executed testament off Sepolia, no wallet connected.
await page.goto(`${BASE_URL}/porte`, { waitUntil: "networkidle" });
await page.getByText("La porte est ouverte.").waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);
await capture(page, "03-door");

await browser.close();
