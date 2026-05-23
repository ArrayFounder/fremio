"use client";

import React, { useEffect, useRef, useState } from "react";

const FILLER_HINTS = ["Smile!", "Cheese!", "Freeze!", "Strike a pose!", "Look pretty!"];
const TYPING_SPEED_MS = 70;  // ms per character
const HOLD_DURATION   = 2000; // ms after fully typed
const EXIT_DURATION   = 400;   // ms for slide-out animation
const CYCLE_GAP       = 150;   // ms pause before next filler starts typing

type FillerState = "typing" | "hold" | "exit" | "hidden";
export type CaptureHintPhase = "filler" | "preparing";

interface CaptureHintOverlayProps {
  visible: boolean;
  phase: CaptureHintPhase;
}

export function CaptureHintOverlay({ visible, phase }: CaptureHintOverlayProps) {
  const [displayText, setDisplayText] = useState("");
  const [hintKey,      setHintKey]     = useState(0);
  const [text,         setText]          = useState(""); // current word

  // Filler-specific state
  const [fillerState,  setFillerState]   = useState<FillerState>("hidden");

  // Refs for timer + state access in callbacks
  const charIdxRef     = useRef(0);
  const hintWordRef    = useRef("");
  const fillerStateRef = useRef<FillerState>("hidden");
  const phaseRef       = useRef<CaptureHintPhase | null>(null);
  const timerRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeKeyRef   = useRef(0); // increments each cycle to cancel stale timers

  fillerStateRef.current = fillerState;

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const pickNextFiller = (): string => {
    let next = FILLER_HINTS[Math.floor(Math.random() * FILLER_HINTS.length)];
    if (next === hintWordRef.current && FILLER_HINTS.length > 1) {
      const others = FILLER_HINTS.filter((h) => h !== next);
      next = others[Math.floor(Math.random() * others.length)];
    }
    return next;
  };

  // ── Main effect: reacts to phase changes + manages filler cycles ─────────
  useEffect(() => {
    clearTimer();
    activeKeyRef.current += 1;
    const myKey = activeKeyRef.current;

    if (!visible) {
      setFillerState("hidden");
      setDisplayText("");
      setText("");
      phaseRef.current = null;
      return;
    }

    const prev = phaseRef.current;
    phaseRef.current = phase;

    // ── Transition: filler → preparing ──────────────────────────────────────
    // Run exit animation on current filler, then show preparing text
    if (prev === "filler" && phase === "preparing") {
      if (fillerStateRef.current !== "hidden") {
        setFillerState("exit");
        timerRef.current = setTimeout(() => {
          if (activeKeyRef.current !== myKey) return; // stale
          clearTimer();
          setFillerState("hidden");
          setDisplayText("");
          setText("");
          // Show preparing text with typing animation
          timerRef.current = setTimeout(() => {
            if (activeKeyRef.current !== myKey) return;
            const PREPARING = "Menyiapkan hasil…";
            charIdxRef.current = 0;
            setText(PREPARING);
            setHintKey((k) => k + 1);
            setDisplayText("");
            setFillerState("typing");

            const typeChar = () => {
              if (activeKeyRef.current !== myKey) return;
              charIdxRef.current += 1;
              setDisplayText(PREPARING.slice(0, charIdxRef.current));
              if (charIdxRef.current < PREPARING.length) {
                timerRef.current = setTimeout(typeChar, TYPING_SPEED_MS);
              } else {
                // Preparing text done typing — STAY in hold until photo appears
                setFillerState("hold");
              }
            };
            timerRef.current = setTimeout(typeChar, 100);
          }, EXIT_DURATION + CYCLE_GAP);
        }, EXIT_DURATION);
      } else {
        // No active filler — show preparing directly
        const PREPARING = "Menyiapkan hasil…";
        charIdxRef.current = 0;
        setText(PREPARING);
        setHintKey((k) => k + 1);
        setDisplayText("");
        setFillerState("typing");

        const typeChar = () => {
          if (activeKeyRef.current !== myKey) return;
          charIdxRef.current += 1;
          setDisplayText(PREPARING.slice(0, charIdxRef.current));
          if (charIdxRef.current < PREPARING.length) {
            timerRef.current = setTimeout(typeChar, TYPING_SPEED_MS);
          } else {
            setFillerState("hold");
          }
        };
        timerRef.current = setTimeout(typeChar, 100);
      }
      return;
    }

    // ── Direct entry to preparing (no filler before) ──────────────────────
    if (phase === "preparing") {
      const PREPARING = "Menyiapkan hasil…";
      charIdxRef.current = 0;
      setText(PREPARING);
      setHintKey((k) => k + 1);
      setDisplayText("");
      setFillerState("typing");

      const typeChar = () => {
        if (activeKeyRef.current !== myKey) return;
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

    // ── Filler cycle ──────────────────────────────────────────────────────
    if (phase === "filler") {
      const startCycle = () => {
        if (activeKeyRef.current !== myKey) return;
        if (fillerStateRef.current !== "hidden") return;

        const word = pickNextFiller();
        hintWordRef.current = word;
        charIdxRef.current = 0;
        setText(word);
        setHintKey((k) => k + 1);
        setDisplayText("");
        setFillerState("typing");

        const typeChar = () => {
          if (activeKeyRef.current !== myKey) return;
          charIdxRef.current += 1;
          setDisplayText(word.slice(0, charIdxRef.current));
          if (charIdxRef.current < word.length) {
            timerRef.current = setTimeout(typeChar, TYPING_SPEED_MS);
          } else {
            setFillerState("hold");
            timerRef.current = setTimeout(() => {
              if (activeKeyRef.current !== myKey) return;
              setFillerState("exit");
              timerRef.current = setTimeout(() => {
                if (activeKeyRef.current !== myKey) return;
                setFillerState("hidden");
                timerRef.current = setTimeout(startCycle, CYCLE_GAP);
              }, EXIT_DURATION);
            }, HOLD_DURATION);
          }
        };
        timerRef.current = setTimeout(typeChar, 100);
      };

      startCycle();
    }
  }, [visible, phase]);

  // ── Don't render if nothing to show ─────────────────────────────────────
  if (fillerState === "hidden" && phase !== "preparing") return null;

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none overflow-hidden">
      <div
        key={hintKey}
        className={`
          relative font-black drop-shadow-2xl select-none text-white whitespace-nowrap
          ${fillerState === "typing" ? "animate-typein" : ""}
          ${fillerState === "hold"   ? "animate-float-hold" : ""}
          ${fillerState === "exit"   ? "animate-slide-out" : ""}
        `}
        style={{ fontSize: phase === "preparing" ? "clamp(1.4rem, 6vw, 4.5rem)" : "clamp(1.8rem, 8vw, 6rem)", lineHeight: 1, color: "#deb7a6" }}
      >
        {displayText || (text ? text.slice(0, 1) : "")}
      </div>
    </div>
  );
}