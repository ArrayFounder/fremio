"use client";

import React, { useEffect, useRef, useState } from "react";

const HINTS = ["Smile!", "Cheese!", "Freeze!", "Strike a pose!", "Look pretty!"];
const TYPING_SPEED_MS = 70;   // ms per character
const HOLD_DURATION  = 2000;  // ms after fully typed
const EXIT_DURATION  = 400;   // ms for slide-out animation
const CYCLE_GAP      = 150;   // ms pause before next hint starts typing

type FillerState = "typing" | "hold" | "exit" | "hidden";

export type CaptureHintPhase = "filler" | "preparing";

interface CaptureHintOverlayProps {
  visible: boolean;
  phase: CaptureHintPhase;
}

export function CaptureHintOverlay({ visible, phase }: CaptureHintOverlayProps) {
  // ── Filler animation state ──────────────────────────────────────────────
  const [displayText, setDisplayText] = useState("");
  const [hintKey,     setHintKey]     = useState(0);
  const [hintWord,    setHintWord]    = useState("");
  const [fillerState, setFillerState] = useState<FillerState>("hidden");
  const charIdxRef    = useRef(0);
  const hintWordRef    = useRef("");
  const fillerStateRef = useRef<FillerState>("hidden");
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);

  fillerStateRef.current = fillerState;

  // ── Filler cycle ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!visible || phase !== "filler") {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setFillerState("hidden");
      setDisplayText("");
      return;
    }

    const pickNext = (): string => {
      let next = HINTS[Math.floor(Math.random() * HINTS.length)];
      if (next === hintWordRef.current && HINTS.length > 1) {
        const others = HINTS.filter((h) => h !== next);
        next = others[Math.floor(Math.random() * others.length)];
      }
      return next;
    };

    const startCycle = () => {
      if (fillerStateRef.current !== "hidden") return;
      const word = pickNext();
      hintWordRef.current = word;
      charIdxRef.current  = 0;
      setHintWord(word);
      setHintKey((k) => k + 1);
      setFillerState("typing");
      setDisplayText("");

      const typeNextChar = () => {
        charIdxRef.current += 1;
        setDisplayText(word.slice(0, charIdxRef.current));
        if (charIdxRef.current < word.length) {
          timerRef.current = setTimeout(typeNextChar, TYPING_SPEED_MS);
        } else {
          setFillerState("hold");
          timerRef.current = setTimeout(() => {
            if (fillerStateRef.current !== "hold") return;
            setFillerState("exit");
            timerRef.current = setTimeout(() => {
              if (fillerStateRef.current !== "exit") return;
              setFillerState("hidden");
              timerRef.current = setTimeout(startCycle, CYCLE_GAP);
            }, EXIT_DURATION);
          }, HOLD_DURATION);
        }
      };

      timerRef.current = setTimeout(typeNextChar, 100);
    };

    startCycle();
    return () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
  }, [visible, phase]);

  if (fillerState !== "hidden" && phase === "filler") {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden">
        <div
          key={hintKey}
          className={`
            relative font-black drop-shadow-2xl select-none text-white whitespace-nowrap
            ${fillerState === "typing" ? "animate-typein" : ""}
            ${fillerState === "hold"   ? "animate-float-hold" : ""}
            ${fillerState === "exit"   ? "animate-slide-out"  : ""}
          `}
          style={{ fontSize: "clamp(1.8rem, 8vw, 6rem)", lineHeight: 1, color: "#deb7a6" }}
        >
          {displayText || hintWord.slice(0, 1)}
        </div>
      </div>
    );
  }

  if (phase === "preparing" && visible) {
    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none">
        <div className="animate-spin-slow text-6xl" style={{ color: "#deb7a6" }}>⏳</div>
        <p
          className="mt-4 font-black text-white drop-shadow-2xl"
          style={{ fontSize: "clamp(1.8rem, 7vw, 5.5rem)", lineHeight: 1, color: "#deb7a6" }}
        >
          Menyiapkan hasil…
        </p>
      </div>
    );
  }

  return null;
}