"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { AnimatePresence, motion } from "motion/react";

import { COPY, type Copy, type Language } from "@/lib/i18n";

/**
 * Which language the interface is speaking.
 *
 * The choice lives in React state and nowhere else: no cookie, no storage. It survives every
 * in-app navigation because the provider sits above the router outlet, and it resets on a
 * hard reload, which is the honest behaviour for a preference nobody asked us to remember.
 */

type LanguageControls = {
  language: Language;
  copy: Copy;
  toggleLanguage: () => void;
};

const LanguageContext = createContext<LanguageControls | null>(null);

export function useTranslation(): LanguageControls {
  const controls = useContext(LanguageContext);
  if (controls === null) {
    throw new Error("[useTranslation] must be used inside a LanguageProvider");
  }
  return controls;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>("fr");

  const toggleLanguage = useCallback(() => {
    setLanguage((current) => (current === "fr" ? "en" : "fr"));
  }, []);

  const controls = useMemo<LanguageControls>(
    () => ({ language, copy: COPY[language], toggleLanguage }),
    [language, toggleLanguage],
  );

  return <LanguageContext.Provider value={controls}>{children}</LanguageContext.Provider>;
}

/**
 * Keeps the document's language attribute honest.
 *
 * Screen readers pick pronunciation from `lang`, so a French page announced as English is a
 * real accessibility failure, not a detail. Rendered as a component rather than an effect in
 * the provider so the attribute is written by the one thing that owns it.
 */
export function HtmlLanguageSync() {
  const { language } = useTranslation();

  // External system: the document element, which React does not own here because the
  // attribute is written by the server render first.
  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  return null;
}

/** The one control that switches language. Names the destination, not the current state. */
export function LanguageToggle() {
  const { copy, toggleLanguage } = useTranslation();

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      title={copy.switchTo}
      className="type-small relative overflow-hidden text-ink-muted transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
    >
      {/* The text-swap recipe: the leaving name slips up 4px as the next slips in. */}
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={copy.otherLanguageName}
          className="block"
          initial={{ opacity: 0, y: 4, filter: "blur(2px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -4, filter: "blur(2px)" }}
          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          {copy.otherLanguageName}
        </motion.span>
      </AnimatePresence>
    </button>
  );
}
