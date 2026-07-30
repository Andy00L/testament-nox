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

import { Volume, VolumeOff } from "@appica/icons-react";

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

/**
 * The one control that turns the chimes on. Deliberately quiet and out of the way, held in
 * the wavy ink frame (`/ui/ink-frame.svg`) rather than a paper pill: the frame's job across
 * this product is marking the ambient controls that live on the scene itself, and a control
 * about wind chimes is the first thing it belongs around.
 */
export function SoundToggle() {
  const { isEnabled, toggle } = useSound();
  const { copy } = useTranslation();

  const label = isEnabled ? copy.sound.disable : copy.sound.enable;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={isEnabled}
      aria-label={label}
      className="type-small flex items-center gap-2 px-3 py-2.5 text-ink-muted transition-all duration-(--dur-small) ease-(--ease-standard) hover:-translate-y-0.5 hover:text-ink sm:px-4"
      style={{
        // A wash of the field inside the frame: the toggle floats over whatever a page
        // ends with (the door's illustration included), and frame lines alone left the
        // label fighting the art beneath it.
        backgroundColor: "rgba(243, 232, 213, 0.9)",
        backgroundImage: 'url("/ui/ink-frame.svg")',
        backgroundSize: "100% 100%",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* The icon-swap recipe: both marks share one cell and trade places on toggle. */}
      <span className="icon-swap" data-state={isEnabled ? "a" : "b"} aria-hidden="true">
        <Volume size={15} strokeWidth={1.5} data-icon="a" />
        <VolumeOff size={15} strokeWidth={1.5} data-icon="b" />
      </span>
      {/* The icon is the whole control on a phone, where the spelled label overlapped the
          form it floats over; `aria-label` above keeps its name for everyone. */}
      <span className="max-sm:hidden">{label}</span>
    </button>
  );
}
