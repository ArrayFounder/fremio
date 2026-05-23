"use client";

import React, { useEffect, useRef, useState } from "react";

const HINTS = ["Smile!", "Cheese!", "Freeze!", "Strike a pose!", "Look pretty!"];
const TYPING_SPEED_MS = 70;   // ms per character
const HOLD_DURATION  = 2000;  // ms after fully typed
const EXIT_DURATION  = 400;   // ms for slide-out animation
const CYCLE_GAP      = 150;   // ms pause before next hint starts typing

type HintState = "typing" | "hold" | "exit" | "hidden";

export function CaptureHintOverlay({ visible }: { visible: boolean }) {
  const [displayText,  setDisplayText]  = useState("");
  const [hintKey,      setHintKey]      = useState(0);       // increment to re-trigger CSS animation
  const [hintWord,     setHintWord]     = useState("");
  const [state,        setState]        = useState<HintState>("hidden");
  const charIdxRef = useRef(0);
  const hintWordRef = useRef("");
  const stateRef    = useRef<HintState>("hidden");
  const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep stateRef in sync so timer callbacks always read current state
  stateRef.current = state;

  useEffect(() => {
    if (!visible) {
      // Cancel any pending timer and hide
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setState("hidden");
      setDisplayText("");
      return;
    }

    const pickNext = (): string => {
      let next = HINTS[Math.floor(Math.random() * HINTS.length)];
      // Avoid repeating same word twice
      if (next === hintWordRef.current && HINTS.length > 1) {
        const others = HINTS.filter((h) => h !== next);
        next = others[Math.floor(Math.random() * others.length)];
      }
      return next;
    };

    const startCycle = () => {
      if (stateRef.current !== "hidden") return;

      const word = pickNext();
      hintWordRef.current = word;
      charIdxRef.current = 0;
      setHintWord(word);
      setHintKey((k) => k + 1); // new key → CSS re-starts animation
      setState("typing");
      setDisplayText("");

      const typeNextChar = () => {
        charIdxRef.current += 1;
        setDisplayText(word.slice(0, charIdxRef.current));
        if (charIdxRef.current < word.length) {
          timerRef.current = setTimeout(typeNextChar, TYPING_SPEED_MS);
        } else {
          // Fully typed → hold
          setState("hold");
          timerRef.current = setTimeout(() => {
            if (stateRef.current !== "hold") return;
            setState("exit");
            timerRef.current = setTimeout(() => {
              if (stateRef.current !== "exit") return;
              setState("hidden");
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
  }, [visible]);

  if (state === "hidden") return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden">
      <div
        key={hintKey}
        className={`
          relative font-black drop-shadow-2xl select-none
          text-white whitespace-nowrap
          ${state === "typing" ? "animate-typein" : ""}
          ${state === "hold"   ? "animate-float-hold" : ""}
          ${state === "exit"   ? "animate-slide-out"  : ""}
        `}
        style={{ fontSize: "clamp(2.5rem, 10vw, 8rem)", lineHeight: 1, color: "#d4a017" }}
      >
        {displayText || hintWord.slice(0, 1)}
      </div>
    </div>
  );
}