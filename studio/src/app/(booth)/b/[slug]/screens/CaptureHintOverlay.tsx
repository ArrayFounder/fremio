"use client";

import React, { useEffect, useRef, useState } from "react";

const FILLER_HINTS = ["Smile!", "Cheese!", "Freeze!", "Strike a pose!", "Look pretty!"];
const TYPING_SPEED_MS = 70;  // ms per character
const HOLD_DURATION   = 2000; // ms after fully typed
const EXIT_DURATION   = 400;   // ms for slide-out animation
const CYCLE_GAP       = 150;   // ms pause before next filler starts typing

type FillerState = "hidden" | "typing" | "hold" | "exit";
export type CaptureHintPhase = "filler" | "preparing";

interface CaptureHintOverlayProps {
  visible: boolean;
  phase: CaptureHintPhase;
}

export function CaptureHintOverlay({ visible, phase }: CaptureHintOverlayProps) {
  const [displayText, setDisplayText] = useState("");
  const [hintKey,      setHintKey]     = useState(0);
  const [text,         setText]          = useState("");
  const [fillerState,  setFillerState]   = useState<FillerState>("hidden");

  const charIdxRef     = useRef(0);
  const hintWordRef    = useRef("");
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cycleRef       = useRef(0);          // increments each cycle — stale timers ignore
  const startedRef     = useRef(false);     // guards against double-start within same effect run
  const prevPhaseRef   = useRef<CaptureHintPhase | null>(null);

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const pickNext = (): string => {
    let next = FILLER_HINTS[Math.floor(Math.random() * FILLER_HINTS.length)];
    if (next === hintWordRef.current && FILLER_HINTS.length > 1) {
      const others = FILLER_HINTS.filter((h) => h !== next);
      next = others[Math.floor(Math.random() * others.length)];
    }
    return next;
  };

  // ── Single effect: all phase transitions + filler cycles ──────────────────
  useEffect(() => {
    clearTimer();
    cycleRef.current += 1;
    const myCycle = cycleRef.current;
    startedRef.current = false;

    if (!visible) {
      setFillerState("hidden");
      setDisplayText("");
      setText("");
      prevPhaseRef.current = null;
      return;
    }

    const prev = prevPhaseRef.current;
    prevPhaseRef.current = phase;

    // ── filler → preparing: exit current filler, then show preparing ─────────
    if (prev === "filler" && phase === "preparing") {
      if (!startedRef.current) {
        startedRef.current = true;
        // Run exit animation, then switch to preparing text
        setFillerState("exit");
        timerRef.current = setTimeout(() => {
          if (cycleRef.current !== myCycle) return;
          clearTimer();
          setFillerState("hidden");
          setDisplayText("");
          setText("");

          timerRef.current = setTimeout(() => {
            if (cycleRef.current !== myCycle) return;
            // Show "Menyiapkan hasil…" with typing animation
            const PREPARING = "Menyiapkan hasil…";
            charIdxRef.current = 0;
            setText(PREPARING);
            setHintKey((k) => k + 1);
            setDisplayText("");
            setFillerState("typing");

            const typeChar = () => {
              if (cycleRef.current !== myCycle) return;
              charIdxRef.current += 1;
              setDisplayText(PREPARING.slice(0, charIdxRef.current));
              if (charIdxRef.current < PREPARING.length) {
                timerRef.current = setTimeout(typeChar, TYPING_SPEED_MS);
              } else {
                setFillerState("hold");
              }
            };
            timerRef.current = setTimeout(typeChar, 100);
          }, EXIT_DURATION + CYCLE_GAP);
        }, EXIT_DURATION);
      }
      return;
    }

    // ── Direct entry to preparing ───────────────────────────────────────────
    if (phase === "preparing") {
      const PREPARING = "Menyiapkan hasil…";
      charIdxRef.current = 0;
      setText(PREPARING);
      setHintKey((k) => k + 1);
      setDisplayText("");
      setFillerState("typing");
      startedRef.current = true;

      const typeChar = () => {
        if (cycleRef.current !== myCycle) return;
        charIdxRef.current += 1;
        setDisplayText(PREPARING.slice(0, charIdxRef.current));
        if (charIdxRef.current < PREPARING.length) {
          timerRef.current = setTimeout(typeChar, TYPING_SPEED_MS);
        } else {
          setFillerState("hold");
        }
      };
      timerRef.current = setTimeout(typeChar, 100);
      return;
    }

    // ── Filler cycle ────────────────────────────────────────────────────────
    if (phase === "filler") {
      if (!startedRef.current) {
        startedRef.current = true;

        const startCycle = () => {
          if (cycleRef.current !== myCycle) return;
          if (fillerState !== "hidden" && fillerState !== "exit") return; // debounce
          // Actually we need to check via ref — check against current state
          if (cycleRef.current !== myCycle) return;

          const word = pickNext();
          hintWordRef.current = word;
          charIdxRef.current = 0;
          setText(word);
          setHintKey((k) => k + 1);
          setDisplayText("");
          setFillerState("typing");

          const typeChar = () => {
            if (cycleRef.current !== myCycle) return;
            charIdxRef.current += 1;
            setDisplayText(word.slice(0, charIdxRef.current));
            if (charIdxRef.current < word.length) {
              timerRef.current = setTimeout(typeChar, TYPING_SPEED_MS);
            } else {
              setFillerState("hold");
              timerRef.current = setTimeout(() => {
                if (cycleRef.current !== myCycle) return;
                setFillerState("exit");
                timerRef.current = setTimeout(() => {
                  if (cycleRef.current !== myCycle) return;
                  setFillerState("hidden");
                  timerRef.current = setTimeout(() => {
                    if (cycleRef.current !== myCycle) return;
                    startCycle();
                  }, CYCLE_GAP);
                }, EXIT_DURATION);
              }, HOLD_DURATION);
            }
          };
          timerRef.current = setTimeout(typeChar, 100);
        };

        startCycle();
      }
    }
  }, [visible, phase]);

  // Guard: only render when fillerState is not hidden OR preparing
  if (fillerState === "hidden" && phase !== "preparing") return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none overflow-hidden">
      <div
        key={hintKey}
        className={`
          relative font-black drop-shadow-2xl select-none text-white whitespace-nowrap
          ${fillerState === "typing" ? "animate-typein" : ""}
          ${fillerState === "hold"   ? "animate-float-hold" : ""}
          ${fillerState === "exit"   ? "animate-slide-out" : ""}
        `}
        style={{
          fontSize: phase === "preparing"
            ? "clamp(1.2rem, 5vw, 3.8rem)"
            : "clamp(1.8rem, 8vw, 6rem)",
          lineHeight: 1,
          color: "#deb7a6",
        }}
      >
        {displayText || (text ? text.slice(0, 1) : "")}
      </div>
    </div>
  );
}