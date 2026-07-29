import type { Metadata } from "next";
import localFont from "next/font/local";

import { CurtainStage } from "@/components/scene/CurtainStage";
import { DoorwayNav } from "@/components/nav/DoorwayNav";
import { Eave } from "@/components/scene/Eave";
import { HtmlLanguageSync, LanguageProvider } from "@/components/i18n/LanguageProvider";
import { SoundProvider, SoundToggle } from "@/components/scene/SoundProvider";
import { WalletProviders } from "@/app/providers";

import "./globals.css";

/**
 * Gambarino, self-hosted from Fontshare. Chosen by rendering it against Sentient and
 * Tanker on the real headline: its flared, calligraphic terminals read engraved and
 * ceremonial, and it carries French diacritics correctly.
 */
const gambarino = localFont({
  src: "../fonts/gambarino-regular.woff2",
  variable: "--font-gambarino",
  weight: "400",
  display: "swap",
});

/** A 1276-byte subset carrying exactly two glyphs: 传 and 承. Nothing else is ever set in it. */
const notoSerifSc = localFont({
  src: "../fonts/noto-serif-sc-subset.woff2",
  variable: "--font-noto-serif-sc",
  weight: "500",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Testament",
  description:
    "Un testament confidentiel pour votre Safe, chiffré jusqu'au moment où il doit s'exécuter. A confidential will for your Safe, encrypted until the moment it must execute.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // `lang` starts French and is kept honest by HtmlLanguageSync when the visitor switches.
    <html lang="fr" className={`${gambarino.variable} ${notoSerifSc.variable} h-full`}>
      <body className="tatami-field relative flex min-h-full flex-col overflow-x-hidden">
        <WalletProviders>
          <LanguageProvider>
            <HtmlLanguageSync />
            <SoundProvider>
              <CurtainStage>
                <Eave />
                <DoorwayNav />
                <main
                  className="relative flex flex-1 flex-col"
                  style={{ zIndex: "var(--layer-content)" }}
                >
                  {children}
                </main>
                {/* Bottom right, out of the copy column's way on every screen. */}
                <div
                  className="pointer-events-none fixed bottom-5 right-6 sm:bottom-6 sm:right-10"
                  style={{ zIndex: "var(--layer-nav)" }}
                >
                  {/* On the plaque's paper, so it stays legible over the illustration. */}
                  <div className="panel pointer-events-auto px-3 py-1.5">
                    <SoundToggle />
                  </div>
                </div>
              </CurtainStage>
            </SoundProvider>
          </LanguageProvider>
        </WalletProviders>
      </body>
    </html>
  );
}
