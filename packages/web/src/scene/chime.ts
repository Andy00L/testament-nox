/**
 * The chimes.
 *
 * Metallic FM tones on a D major pentatonic, built straight on the Web Audio API rather
 * than pulled from a synthesis library: five notes and one envelope do not justify 200KB,
 * and hand-built lets the timbre belong to this product.
 *
 * Silent until the listener asks for it. Nothing here ever starts on its own.
 */

/**
 * D major pentatonic (D E F# A B), two octaves. Unit: Hz.
 * A pentatonic has no semitone clashes, so notes struck in any order stay consonant, which
 * matters when the trigger is a physical simulation rather than a score.
 */
const PENTATONIC_HZ = [
  293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 880.0, 987.77,
] as const;

/** Ratio of modulator to carrier frequency. Inharmonic on purpose: this is what reads as metal. */
const MODULATION_RATIO = 2.76;

/** Modulation depth at the strike, decaying with the note. Unit: Hz. */
const MODULATION_DEPTH_HZ = 620;

/** How long a strike takes to fade out. Unit: seconds. */
const DECAY_SECONDS = 2.6;

/** Peak gain of a single strike, before the master gain. Kept low: several may overlap. */
const STRIKE_GAIN = 0.09;

export type ChimeVoice = {
  /** Strikes one note. `brightness` 0 to 1 picks how high up the scale it lands. */
  strike: (brightness: number) => void;
  /** Strikes a short run up the scale. The heartbeat's sound. */
  strikeRun: (noteCount?: number) => void;
  close: () => void;
};

/**
 * Creates the audio graph. Must be called from a user gesture: browsers refuse to start an
 * AudioContext otherwise, which is the behaviour we want anyway.
 */
export function createChimeVoice(): ChimeVoice | null {
  // No webkit-prefixed fallback: Next 16's floor is Safari 16.4, and Safari has shipped
  // AudioContext unprefixed since 14.1.
  // sourceRef: node_modules/next/dist/docs/01-app/02-guides/upgrading/version-16.md
  if (typeof window.AudioContext === "undefined") {
    return null;
  }

  const audioContext = new AudioContext();
  const masterGain = audioContext.createGain();
  masterGain.gain.value = 0.85;
  masterGain.connect(audioContext.destination);

  function strikeAt(frequencyHz: number, startTime: number): void {
    const carrier = audioContext.createOscillator();
    const modulator = audioContext.createOscillator();
    const modulationGain = audioContext.createGain();
    const envelope = audioContext.createGain();

    carrier.type = "sine";
    carrier.frequency.value = frequencyHz;

    modulator.type = "sine";
    modulator.frequency.value = frequencyHz * MODULATION_RATIO;

    // The modulation index falls faster than the note, so the strike is bright and the
    // tail is pure. That contrast is the whole character of a struck metal bar.
    modulationGain.gain.setValueAtTime(MODULATION_DEPTH_HZ, startTime);
    modulationGain.gain.exponentialRampToValueAtTime(1, startTime + DECAY_SECONDS * 0.34);

    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.exponentialRampToValueAtTime(STRIKE_GAIN, startTime + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, startTime + DECAY_SECONDS);

    modulator.connect(modulationGain);
    modulationGain.connect(carrier.frequency);
    carrier.connect(envelope);
    envelope.connect(masterGain);

    modulator.start(startTime);
    carrier.start(startTime);
    modulator.stop(startTime + DECAY_SECONDS);
    carrier.stop(startTime + DECAY_SECONDS);
  }

  function pickFrequency(brightness: number): number {
    const clamped = Math.min(1, Math.max(0, brightness));
    const index = Math.round(clamped * (PENTATONIC_HZ.length - 1));
    return PENTATONIC_HZ[index] ?? PENTATONIC_HZ[0];
  }

  return {
    strike(brightness: number) {
      void audioContext.resume();
      strikeAt(pickFrequency(brightness), audioContext.currentTime);
    },
    strikeRun(noteCount = 5) {
      void audioContext.resume();
      const startTime = audioContext.currentTime;
      for (let noteIndex = 0; noteIndex < noteCount; noteIndex += 1) {
        const frequency = PENTATONIC_HZ[noteIndex % PENTATONIC_HZ.length] ?? PENTATONIC_HZ[0];
        // 78ms apart: inside the premium stagger band, so the run reads as one gesture.
        strikeAt(frequency, startTime + noteIndex * 0.078);
      }
    },
    close() {
      void audioContext.close();
    },
  };
}
