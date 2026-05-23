"use client";

import React, { useCallback, useEffect, useState } from "react";

const FILLER_HINTS = ["Smile!", "Cheese!", "Freeze!", "Strike a pose!", "Look pretty!"];
const TYPING_SPEED_MS = 60;
const FILLER_HOLD_MS  = 2000;
const EXIT_MS         = 300;
const GAP_MS          = 80;
const PREP_HOLD_MS    = 700;
const PREP_GAP_MS     = 800;

type Phase = "idle" | "filler" | "preparing";

/** Represents one animation step: what to show and how long to wait */
interface Step {
  word: string;
  state: "typing" | "hold" | "exit";
  waitMs: number;
}

function buildFillerSteps(): Step[] {
  const word = FILLER_HINTS[Math.floor(Math.random() * FILLER_HINTS.length)];
  return [
    { word, state: "typing", waitMs: word.length * TYPING_SPEED_MS },
    { word, state: "hold",    waitMs: FILLER_HOLD_MS },
    { word, state: "exit",    waitMs: EXIT_MS },
    { word: "",  state: "exit", waitMs: GAP_MS }, // hidden
  ];
}

function buildPreparingSteps(): Step[] {
  const word = "Menyiapkan hasil…";
  return [
    { word, state: "typing", waitMs: word.length * TYPING_SPEED_MS },
    { word, state: "hold",    waitMs: PREP_HOLD_MS },
    { word, state: "exit",    waitMs: EXIT_MS },
    { word: "",  state: "exit", waitMs: PREP_GAP_MS }, // repeat
  ];
}

interface CaptureHintOverlayProps {
  capturePhase: "idle" | "filler" | "preparing";
}

export function CaptureHintOverlay({ capturePhase }: CaptureHintOverlayProps) {
  const [stepIdx,   setStepIdx]   = useState(-1); // -1 = not rendered
  const [word,      setWord]       = useState("");
  const [animClass, setAnimClass]  = useState("");

  // ── Reset when phase goes to idle (photo shown) ──────────────────────────
  useEffect(() => {
    if (capturePhase === "idle") {
      setStepIdx(-1);
      setWord("");
      setAnimClass("");
    }
  }, [capturePhase]);

  // ── Animation runner via recursive setTimeout chain ─────────────────────────
  useEffect(() => {
    if (capturePhase === "idle") return;

    let cancelled = false;

    const runStep = (idx: number, steps: Step[]) => {
      if (cancelled) return;
      const step = steps[idx];
      setWord(step.word);
      setAnimClass(step.state === "typing" ? "animate-typein"
        : step.state === "hold"   ? "animate-float-hold"
        : step.state === "exit"   ? "animate-slide-out"
        : "");
      setStepIdx(idx);

      setTimeout(() => {
        if (cancelled) return;
        const nextIdx = idx + 1;
        if (nextIdx < steps.length) {
          runStep(nextIdx, steps);
        } else {
          // End of cycle — rebuild and repeat (preparing only, filler ends)
          if (capturePhase === "preparing") {
            runStep(0, buildPreparingSteps());
          } else {
            setStepIdx(-1); // hide filler at end
          }
        }
      }, step.waitMs);
    };

    // Kick off first step after brief delay
    setTimeout(() => {
      if (cancelled) return;
      const steps = capturePhase === "preparing" ? buildPreparingSteps() : buildFillerSteps();
      runStep(0, steps);
    }, 50);

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturePhase]);

  if (stepIdx < 0 || word === "") return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none overflow-hidden">
      <div
        className={`relative font-black drop-shadow-2xl select-none text-white whitespace-nowrap ${animClass}`}
        style={{
          fontSize: capturePhase === "preparing"
            ? "clamp(1.2rem, 5vw, 3.8rem)"
            : "clamp(1.8rem, 8vw, 6rem)",
          lineHeight: 1,
          color: "#deb7a6",
        }}
      >
        {word}
      </div>
    </div>
  );
}