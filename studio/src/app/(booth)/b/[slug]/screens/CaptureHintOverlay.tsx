"use client";

import React, { useEffect, useRef, useState } from "react";

const FILLER_HINTS = ["Smile!", "Cheese!", "Freeze!", "Strike a pose!", "Look pretty!"];
const TYPING_SPEED_MS = 70;  // ms per character
const HOLD_DURATION   = 2000; // ms after fully typed
const EXIT_DURATION   = 400;  // ms for slide-out animation
const CYCLE_GAP       = 150;   // ms pause before next filler starts typing

type FillerState = "typing" | "hold" | "exit" | "hidden";
export type CaptureHintPhase = "filler" | "preparing";

interface CaptureHintOverlayProps {
  visible: boolean;
  phase: CaptureHintPhase;
}

export function CaptureHintOverlay({ visible, phase }: CaptureHintOverlayProps) {
  const [displayText,  setDisplayText]  = useState("");
  const [hintKey,      setHintKey]       = useState(0);
  const [text,         setText]           = useState("");  // current displayed word
  const [fillerState,  setFillerState]   = useState<FillerState>("hidden");
  const charIdxRef     = useRef(0);
  const hintWordRef    = useRef("");
  const prevPhaseRef  = useRef<CaptureHintPhase | null>(null);
  const fillerStateRef = useRef<FillerState>("hidden");
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const animKeyRef     = useRef(0); // separate key for CSS animation restart

  fillerStateRef.current = fillerState;

  // ── Main effect: handles phase changes and filler cycles ──────────────
  useEffect(() => {
    if (!visible) {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
      setFillerState("hidden");
      setDisplayText("");
      setText("");
      prevPhaseRef.current = null;
      return;
    }

    const prev = prevPhaseRef.current;

    // Transition from filler → preparing: run exit animation, then show preparing text
    if (prev === "filler" && phase === "preparing") {
      // Hide filler immediately, keep container for seamless transition
      setFillerState("exit");
      timerRef.current = setTimeout(() => {
        if (fillerStateRef.current !== "exit") return;
        setFillerState("hidden");
        // Start preparing text with typing animation
        timerRef.current = setTimeout(() => {
          animKeyRef.current += 1;
          setHintKey((k) => k + 1);
          setText("Menyiapkan hasil…");
          charIdxRef.current = 0;
          setDisplayText("");
          setFillerState("typing");

          const PREPARING_TEXT = "Menyiapkan hasil…";
          const typePrepChar = () => {
            charIdxRef.current += 1;
            setDisplayText(PREPARING_TEXT.slice(0, charIdxRef.current));
            if (charIdxRef.current < PREPARING_TEXT.length) {
              timerRef.current = setTimeout(typePrepChar, TYPING_SPEED_MS);
            } else {
              setFillerState("hold");
            }
          };
          timerRef.current = setTimeout(typePrepChar, 100);
        }, EXIT_DURATION + CYCLE_GAP);
      }, EXIT_DURATION);
      prevPhaseRef.current = phase;
      return;
    }

    prevPhaseRef.current = phase;

    // ── Filler cycle (only when in filler phase) ──────────────────────────
    if (phase === "filler") {
      const pickNext = (): string => {
        let next = FILLER_HINTS[Math.floor(Math.random() * FILLER_HINTS.length)];
        if (next === hintWordRef.current && FILLER_HINTS.length > 1) {
          const others = FILLER_HINTS.filter((h) => h !== next);
          next = others[Math.floor(Math.random() * others.length)];
        }
        return next;
      };

      const startCycle = () => {
        if (fillerStateRef.current !== "hidden") return;
        const word = pickNext();
        hintWordRef.current = word;
        charIdxRef.current  = 0;
        setText(word);
        animKeyRef.current += 1;
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
      return;
    }

    // Preparing phase (direct entry — no filler before it)
    if (phase === "preparing") {
      animKeyRef.current += 1;
      setHintKey((k) => k + 1);
      setText("Menyiapkan hasil…");
      charIdxRef.current = 0;
      setDisplayText("");
      setFillerState("typing");

      const PREPARING_TEXT = "Menyiapkan hasil…";
      const typePrepChar = () => {
        charIdxRef.current += 1;
        setDisplayText(PREPARING_TEXT.slice(0, charIdxRef.current));
        if (charIdxRef.current < PREPARING_TEXT.length) {
          timerRef.current = setTimeout(typePrepChar, TYPING_SPEED_MS);
        } else {
          setFillerState("hold");
        }
      };
      timerRef.current = setTimeout(typePrepChar, 100);
    }
  }, [visible, phase]);

  if (fillerState === "hidden" && phase !== "preparing") return null;

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
        style={{
          fontSize: "clamp(1.8rem, 8vw, 6rem)",
          lineHeight: 1,
          color: "#deb7a6",
        }}
      >
        {displayText || (text && text.slice(0, 1)) || ""}
      </div>
    </div>
  );
}