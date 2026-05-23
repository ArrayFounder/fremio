"use client";

import React, { useEffect, useState } from "react";

const FILLER_HINTS = ["Smile!", "Cheese!", "Freeze!", "Strike a pose!", "Look pretty!"];
const TYPING_SPEED_MS = 60;
const FILLER_HOLD_MS  = 2000;
const EXIT_MS         = 300;
const GAP_MS          = 80;
const PREP_HOLD_MS    = 700;
const PREP_GAP_MS     = 800;

function typingDuration(word: string): number {
  return word.length * TYPING_SPEED_MS;
}

interface CaptureHintOverlayProps {
  capturePhase: "idle" | "filler" | "preparing";
}

export function CaptureHintOverlay({ capturePhase }: CaptureHintOverlayProps) {
  const [word,      setWord]      = useState("");
  const [animClass, setAnimClass]  = useState("");
  const [visible,   setVisible]   = useState(false);

  useEffect(() => {
    // Immediately hide when photo appears (phase → idle)
    if (capturePhase === "idle") {
      setVisible(false);
      setWord("");
      setAnimClass("");
      return;
    }

    setVisible(true);

    let stop = false; // local flag — set true to cancel all pending timers

    const runStep = (state: "typing" | "hold" | "exit", w: string, waitMs: number, next: () => void) => {
      if (stop) return;
      setWord(w);
      setAnimClass(state === "typing" ? "animate-typein" : state === "hold" ? "animate-float-hold" : "animate-slide-out");
      setTimeout(() => {
        if (stop) return;
        next();
      }, waitMs);
    };

    const runFillerCycle = () => {
      if (stop) return;
      const hints = FILLER_HINTS.filter((h) => h !== word);
      const pick = hints.length > 0 ? hints[Math.floor(Math.random() * hints.length)] : FILLER_HINTS[Math.floor(Math.random() * FILLER_HINTS.length)];
      runStep("typing", pick, typingDuration(pick), () => {
        if (stop) return;
        runStep("hold", pick, FILLER_HOLD_MS, () => {
          if (stop) return;
          runStep("exit", pick, EXIT_MS, () => {
            if (stop) return;
            setWord("");
            setAnimClass("");
            setTimeout(() => {
              if (stop) return;
              if (capturePhase === "filler") runFillerCycle();
            }, GAP_MS);
          });
        });
      });
    };

    const runPreparingCycle = () => {
      if (stop) return;
      const PREP = "Menyiapkan hasil…";
      runStep("typing", PREP, typingDuration(PREP), () => {
        if (stop) return;
        runStep("hold", PREP, PREP_HOLD_MS, () => {
          if (stop) return;
          runStep("exit", PREP, EXIT_MS, () => {
            if (stop) return;
            setWord("");
            setAnimClass("");
            setTimeout(() => {
              if (stop) return;
              if (capturePhase === "preparing") runPreparingCycle();
            }, PREP_GAP_MS);
          });
        });
      });
    };

    // Start appropriate animation
    if (capturePhase === "preparing") {
      runPreparingCycle();
    } else {
      runFillerCycle();
    }

    // Cleanup: cancel all pending timers when phase changes
    return () => {
      stop = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capturePhase]);

  if (!visible) return null;

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