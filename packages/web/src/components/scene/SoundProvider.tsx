"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { createChimeVoice, type ChimeVoice } from "@/scene/chime";
import { useTranslation } from "@/components/i18n/LanguageProvider";

/**
 * Sound, off until asked for.
 *
 * The audio graph is not even built until the listener turns it on, which both respects the
 * browser's autoplay rules and means the page makes no noise at anyone by surprise.
 */

type SoundControls = {
  isEnabled: boolean;
  toggle: () => void;
  /** Strikes one chime. `brightness` 0 to 1 picks how high up the scale it lands. */
  playChime: (brightness: number) => void;
  /** The heartbeat's run up the scale. */
  playRun: () => void;
};

const SoundContext = createContext<SoundControls | null>(null);

export function useSound(): SoundControls {
  const controls = useContext(SoundContext);
  if (controls === null) {
    throw new Error("[useSound] must be used inside a SoundProvider");
  }
  return controls;
}

export function SoundProvider({ children }: { children: ReactNode }) {
  const voiceRef = useRef<ChimeVoice | null>(null);
  const [isEnabled, setIsEnabled] = useState(false);

  // External system: the Web Audio graph. The provider lives for the app's lifetime in
  // practice, but if it ever unmounts the context must be released, not leaked.
  useEffect(() => {
    return () => {
      voiceRef.current?.close();
      voiceRef.current = null;
    };
  }, []);

  const toggle = useCallback(() => {
    setIsEnabled((wasEnabled) => {
      if (wasEnabled) {
        voiceRef.current?.close();
        voiceRef.current = null;
        return false;
      }
      // Built inside the click handler: an AudioContext created outside a user gesture
      // starts suspended.
      voiceRef.current = createChimeVoice();
      return voiceRef.current !== null;
    });
  }, []);

  const playChime = useCallback((brightness: number) => {
    voiceRef.current?.strike(brightness);
  }, []);

  const playRun = useCallback(() => {
    voiceRef.current?.strikeRun();
  }, []);

  const controls = useMemo<SoundControls>(
    () => ({ isEnabled, toggle, playChime, playRun }),
    [isEnabled, toggle, playChime, playRun],
  );

  return <SoundContext.Provider value={controls}>{children}</SoundContext.Provider>;
}

/** The one control that turns the chimes on. Deliberately quiet and out of the way. */
export function SoundToggle() {
  const { isEnabled, toggle } = useSound();
  const { copy } = useTranslation();

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isEnabled}
      className="type-small text-ink-faint transition-colors duration-(--dur-small) ease-(--ease-standard) hover:text-ink"
    >
      {isEnabled ? copy.sound.disable : copy.sound.enable}
    </button>
  );
}
