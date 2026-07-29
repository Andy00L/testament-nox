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

import { createCurtainScene, type CurtainMood, type CurtainScene } from "@/scene/curtain";

/**
 * Owns the one canvas the whole product shares, and hands every screen two verbs:
 * describe the testament's mood, and send a gust.
 *
 * The canvas is decoration in the strictest sense. Every word and every control on the
 * page is real DOM that renders whether or not this ever paints, so a failed animation
 * frame can never empty a screen.
 */

type CurtainControls = {
  setMood: (mood: CurtainMood) => void;
  sendGust: () => void;
  /** Holds a steady wind while a control is pressed. The curtain leaning is the meter. */
  setCharge: (amount: number) => void;
  /** A local touch on the curtain, in viewport coordinates. Means a line joined the will. */
  rippleAt: (clientX: number, clientY: number) => void;
};

const CurtainContext = createContext<CurtainControls | null>(null);

export function useCurtain(): CurtainControls {
  const controls = useContext(CurtainContext);
  if (controls === null) {
    throw new Error("[useCurtain] must be used inside a CurtainStage");
  }
  return controls;
}

/** Highest device pixel ratio we render at. Beyond 2 the cost buys nothing visible. */
const MAX_PIXEL_RATIO = 2;

function readPaletteFromDocument(): { brass: string; brassDeep: string; iron: string } {
  const computed = getComputedStyle(document.documentElement);
  const readToken = (token: string, fallback: string) =>
    computed.getPropertyValue(token).trim() || fallback;
  // The token sheet stays the single source of truth: the canvas reads the same custom
  // properties the CSS does rather than carrying its own copy of the palette.
  return {
    brass: readToken("--color-brass", "#c9a227"),
    brassDeep: readToken("--color-brass-deep", "#8a6d1f"),
    iron: readToken("--color-iron", "#56524c"),
  };
}

export function CurtainStage({ children }: { children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<CurtainScene | null>(null);
  const [mood, setMoodState] = useState<CurtainMood>({ silence: 0, isReleased: false });

  const setMood = useCallback((nextMood: CurtainMood) => {
    setMoodState((currentMood) =>
      currentMood.silence === nextMood.silence && currentMood.isReleased === nextMood.isReleased
        ? currentMood
        : nextMood,
    );
  }, []);

  const sendGust = useCallback(() => {
    sceneRef.current?.sendGust();
  }, []);

  const setCharge = useCallback((amount: number) => {
    sceneRef.current?.setCharge(amount);
  }, []);

  const rippleAt = useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const bounds = canvas.getBoundingClientRect();
    sceneRef.current?.rippleAt(clientX - bounds.left, clientY - bounds.top);
  }, []);

  const controls = useMemo<CurtainControls>(
    () => ({ setMood, sendGust, setCharge, rippleAt }),
    [setMood, sendGust, setCharge, rippleAt],
  );

  // External system: the canvas 2D context, requestAnimationFrame, ResizeObserver, and
  // window pointer events. None of these are owned by React, so they are set up and torn
  // down here.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const context = canvas.getContext("2d");
    if (context === null) {
      return;
    }

    const scene = createCurtainScene(readPaletteFromDocument());
    sceneRef.current = scene;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const applySize = () => {
      const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      canvas.width = Math.round(cssWidth * pixelRatio);
      canvas.height = Math.round(cssHeight * pixelRatio);
      context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      scene.resize(cssWidth, cssHeight);
      // Let it hang before the first paint, so the curtain is never seen mid-drop.
      scene.settle();
      scene.draw(context);
    };

    applySize();

    const resizeObserver = new ResizeObserver(applySize);
    resizeObserver.observe(canvas);

    const handlePointerMove = (event: PointerEvent) => {
      const bounds = canvas.getBoundingClientRect();
      scene.setPointer(event.clientX - bounds.left, event.clientY - bounds.top);
    };
    const handlePointerLeave = () => scene.clearPointer();

    let animationFrame = 0;
    if (!prefersReducedMotion) {
      window.addEventListener("pointermove", handlePointerMove, { passive: true });
      window.addEventListener("pointerleave", handlePointerLeave);

      let previousTimestamp = performance.now();
      const renderFrame = (timestamp: number) => {
        const deltaSeconds = (timestamp - previousTimestamp) / 1000;
        previousTimestamp = timestamp;
        scene.advance(deltaSeconds);
        scene.draw(context);
        animationFrame = window.requestAnimationFrame(renderFrame);
      };
      animationFrame = window.requestAnimationFrame(renderFrame);
    }

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerleave", handlePointerLeave);
      window.cancelAnimationFrame(animationFrame);
      sceneRef.current = null;
    };
  }, []);

  // External system: the canvas scene again. Mood lives in React state but has to be
  // pushed into the simulation, which is outside React's world.
  useEffect(() => {
    sceneRef.current?.setMood(mood);
  }, [mood]);

  return (
    <CurtainContext.Provider value={controls}>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 h-full w-full"
        style={{ zIndex: "var(--layer-curtain)" }}
      />
      {children}
    </CurtainContext.Provider>
  );
}
