import { mkdir } from "node:fs/promises";
import path from "node:path";

import { chromium, type BrowserContext, type Page } from "playwright";
import sharp from "sharp";

/**
 * The six step images the about page shows, taken against the production build on
 * BASE_URL. Wallet rows come from stub EIP-6963 announcements so the chooser is
 * photographed doing what it really does: listing what the browser detected.
 *
 * Run with: bun run about-shots   (expects `next start -p 3100` to be up)
 *
 * Sections can be named as arguments (`connect vault write heartbeat doors`) to re-shoot
 * only some. The door and heartbeat photographs depend on live testaments being in the
 * right state on Sepolia, so on days the demo wills have expired those sections are left
 * out rather than photographed lying.
 */

const BASE_URL = process.env.VERIFY_BASE_URL ?? "http://127.0.0.1:3100";
const OUTPUT_DIRECTORY = path.join(import.meta.dirname, "..", "public", "about");

/** The demo testaments photographed: the living one and the executed one. */
const CLOSED_TESTAMENT_ID = 3;
const OPEN_TESTAMENT_ID = 1;

/** The test owner's address, so the heartbeat state has a testament to show. */
const OWNER_ADDRESS = "0x1F7481b60669d09404cf2b2493Cc6D7FE3155b8F";

/** Output width of the final webp. Unit: CSS pixels at 2x capture. */
const OUTPUT_WIDTH = 1600;

function buildMonogramIcon(letter: string, background: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="${background}"/><text x="16" y="21.5" font-family="Georgia, serif" font-size="16" text-anchor="middle" fill="#ffffff">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Announces two wallets by EIP-6963. `autoConnectAddress` controls whether the page sees
 * an already-authorised account (the connected states) or a wallet that is merely
 * installed (the chooser state).
 */
async function installWalletStubs(context: BrowserContext, autoConnectAddress: string | null) {
  await context.addInitScript(
    ({ accountAddress, metamaskIcon, rabbyIcon }) => {
      const buildProvider = (accounts: string[]) => ({
        request: async ({ method }: { method: string }) => {
          if (method === "eth_requestAccounts") {
            return accounts.length > 0 ? accounts : [];
          }
          if (method === "eth_accounts") {
            return accounts;
          }
          if (method === "eth_chainId") {
            return "0xaa36a7";
          }
          return null;
        },
        on: () => undefined,
        removeListener: () => undefined,
      });

      // Two wallets are announced only for the chooser photograph. For the connected
      // states a single provider is announced: with two both claiming accounts, wagmi's
      // reconnect cannot pick one and the page stays disconnected.
      const wallets =
        accountAddress === null
          ? [
              { uuid: "88e97ff8-0001-4a5c-a4bd-000000000001", name: "MetaMask", rdns: "io.metamask", icon: metamaskIcon },
              { uuid: "88e97ff8-0002-4a5c-a4bd-000000000002", name: "Rabby", rdns: "io.rabby", icon: rabbyIcon },
            ]
          : [
              { uuid: "88e97ff8-0001-4a5c-a4bd-000000000001", name: "MetaMask", rdns: "io.metamask", icon: metamaskIcon },
            ];
      for (const info of wallets) {
        const detail = {
          info,
          provider: buildProvider(accountAddress === null ? [] : [accountAddress]),
        };
        const announce = () =>
          window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail }));
        window.addEventListener("eip6963:requestProvider", announce);
        announce();
      }
    },
    {
      accountAddress: autoConnectAddress,
      metamaskIcon: buildMonogramIcon("M", "#c66a1e"),
      rabbyIcon: buildMonogramIcon("R", "#4a6fa5"),
    },
  );
}

async function settle(page: Page, milliseconds = 1700) {
  await page.waitForTimeout(milliseconds);
}

async function capture(page: Page, outputName: string) {
  const pngBuffer = await page.screenshot({ type: "png" });
  const outputPath = path.join(OUTPUT_DIRECTORY, outputName);
  await sharp(pngBuffer).resize({ width: OUTPUT_WIDTH }).webp({ quality: 78 }).toFile(outputPath);
  console.log(`[aboutShots] ${outputName}`);
}

/** Which sections this run photographs: the ones named as arguments, or all of them. */
const requestedSections = new Set(process.argv.slice(2));
function isRequested(sectionName: string): boolean {
  return requestedSections.size === 0 || requestedSections.has(sectionName);
}

async function main() {
  await mkdir(OUTPUT_DIRECTORY, { recursive: true });
  const browser = await chromium.launch();

  // ---- 1. The chooser: wallets installed, none connected yet. ----
  if (isRequested("connect")) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    await installWalletStubs(context, null);
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await settle(page);
    await page.getByRole("button", { name: "Connect" }).click();
    await page.waitForTimeout(700);
    await capture(page, "step-connect.webp");
    await context.close();
  }

  // ---- 2. The vault block: the derived address, with whatever act it still needs. ----
  if (isRequested("vault")) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    await installWalletStubs(context, OWNER_ADDRESS);
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/ecrire`, { waitUntil: "networkidle" });
    // The derivation needs the factory's creation code and then the code at the result.
    // Any of the derived-vault hints under the field means both answers are in; the raw
    // input value cannot be waited on, because React never writes it back to the attribute.
    await page
      .getByText(/This vault does not exist yet|The vault is empty|The vault holds|Your vault, derived/)
      .first()
      .waitFor({ timeout: 30000 });
    await settle(page);
    await capture(page, "step-vault.webp");
    await context.close();
  }

  // ---- 3. The filled will. The Safe field stays as derived: that is the point. ----
  if (isRequested("write")) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    await installWalletStubs(context, OWNER_ADDRESS);
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/ecrire`, { waitUntil: "networkidle" });
    await settle(page);
    await page.getByLabel("Heir 1").fill("0x71De5E2141C89F7A6c5260d10D18CbC47fB1a7f2");
    await page.getByLabel("Heir 2").fill("0xe5aFeC35193B23B3AFD1B2C74613598714D5F484");
    const shareFields = page.getByLabel("Share");
    await shareFields.nth(0).fill("60");
    await shareFields.nth(1).fill("40");
    await page.waitForTimeout(1200);
    await capture(page, "step-write.webp");
    await context.close();
  }

  // ---- 4. The heartbeat, connected as the owner of the living testament. ----
  if (isRequested("heartbeat")) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    await installWalletStubs(context, OWNER_ADDRESS);
    const page = await context.newPage();
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await settle(page);
    // By role, not by text: the hero lede also says "send a sign of life" in English.
    await page.getByRole("button", { name: "Send a sign of life" }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(400);
    await capture(page, "step-heartbeat.webp");
    await context.close();
  }

  // ---- 5 and 6. The door, closed then open. No wallet: the door needs none to read. ----
  if (isRequested("doors")) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();

    await page.goto(`${BASE_URL}/porte?id=${CLOSED_TESTAMENT_ID}`, { waitUntil: "networkidle" });
    await page.getByText("The door is closed.").waitFor({ timeout: 20000 });
    await settle(page);
    await capture(page, "step-door-closed.webp");

    await page.goto(`${BASE_URL}/porte?id=${OPEN_TESTAMENT_ID}`, { waitUntil: "networkidle" });
    await page.getByText("The vault has paid").waitFor({ timeout: 30000 });
    await settle(page, 900);
    await capture(page, "step-door-open.webp");
    await context.close();
  }

  await browser.close();
}

await main();
