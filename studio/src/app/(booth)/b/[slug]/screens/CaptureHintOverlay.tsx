"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

const FILLER_HINTS = ["Smile!", "Cheese!", "Freeze!", "Strike a pose!", "Look pretty!"];
const TYPING_SPEED_MS = 55;
const HOLD_DURATION   = 2000;
const EXIT_DURATION   = 300;
const CYCLE_GAP        = 80;
const PREP_HOLD_MS     = 800;
const PREP_REPEAT_MS   = 900;

type TextState = "hidden" | "typing" | "hold" | "exit";
export type CaptureHintPhase = "filler" | "preparing";

export interface CaptureHintOverlayRef {
  /** Instantly hides the overlay — call this when the captured photo is displayed */
  hide: () => void;
}

interface CaptureHintOverlayProps {
  visible: boolean;
  phase: CaptureHintPhase;
}

export const CaptureHintOverlay = forwardRef<CaptureHintOverlayRef, CaptureHintOverlayProps>(
  function CaptureHintOverlay({ visible, phase }, ref) {
    const [displayText, setDisplayText] = useState("");
    const [hintKey,      setHintKey]     = useState(0);
    const [text,         setText]         = useState("");
    const [textState,   setTextState]    = useState<TextState>("hidden");

    const counterRef  = useRef(0);
    const charIdxRef  = useRef(0);
    const hintWordRef = useRef("");
    const timerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevPhaseRef = useRef<CaptureHintPhase | null>(null);

    // ── Expose hide() so CameraScreen can call it when photo appears ──────────
    useImperativeHandle(ref, () => ({ hide: () => { } }), []);

    const clearTimer = () => {
      if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };

    // ── Reset + cancel everything whenever phase changes ───────────────────────
    // This runs BEFORE the animation effect below, acting as the cleanup step.
    // counterRef is incremented so ALL pending timer callbacks become no-ops.
    useEffect(() => {
      const prev = prevPhaseRef.current;
      prevPhaseRef.current = phase;
      clearTimer();

      if (!visible) {
        setTextState("hidden");
        setDisplayText("");
        setText("");
        return;
      }

      // Phase changed from filler to preparing: cancel old filler cycles
      if (prev === "filler" && phase === "preparing") {
        counterRef.current += 1;
        setTextState("hidden");
        setDisplayText("");
        setText("");
        return;
      }

      // Phase changed from preparing to something else: stop preparing cycles
      if (prev === "preparing" && phase !== "preparing") {
        counterRef.current += 1;
        setTextState("hidden");
        setDisplayText("");
        setText("");
        return;
      }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, phase]);

    // ── Animation runner effect ───────────────────────────────────────────────
    useEffect(() => {
      if (!visible) return;

      const myCount = ++counterRef.current;

      const typeText = (word: string, onDone: () => void) => {
        charIdxRef.current = 0;
        setText(word);
        setHintKey((k) => k + 1);
        setDisplayText("");
        setTextState("typing");

        const tick = () => {
          if (counterRef.current !== myCount) return;
          charIdxRef.current += 1;
          setDisplayText(word.slice(0, charIdxRef.current));
          if (charIdxRef.current < word.length) {
            timerRef.current = setTimeout(tick, TYPING_SPEED_MS);
          } else {
            onDone();
          }
        };
        timerRef.current = setTimeout(tick, 100);
      };

      if (phase === "preparing") {
        const PREP = "Menyiapkan hasil…";
        typeText(PREP, () => {
          timerRef.current = setTimeout(() => {
            if (counterRef.current !== myCount) return;
            setTextState("exit");
            timerRef.current = setTimeout(() => {
              if (counterRef.current !== myCount) return;
              setTextState("hidden");
              timerRef.current = setTimeout(() => {
                if (counterRef.current !== myCount) return;
                typeText(PREP, () => {
                  timerRef.current = setTimeout(() => {
                    if (counterRef.current !== myCount) return;
                    setTextState("exit");
                    timerRef.current = setTimeout(() => {
                      if (counterRef.current !== myCount) return;
                      setTextState("hidden");
                    }, EXIT_DURATION);
                  }, EXIT_DURATION);
                });
              }, PREP_REPEAT_MS);
            }, EXIT_DURATION);
          }, PREP_HOLD_MS);
        });
        return;
      }

      // filler phase
      let next = FILLER_HINTS[Math.floor(Math.random() * FILLER_HINTS.length)];
      if (next === hintWordRef.current && FILLER_HINTS.length > 1) {
        const others = FILLER_HINTS.filter((h) => h !== next);
        next = others[Math.floor(Math.random() * others.length)];
      }
      hintWordRef.current = next;
      setTextState("hidden");
      setDisplayText("");
      setText("");
      timerRef.current = setTimeout(() => {
        if (counterRef.current !== myCount) return;
        typeText(next, () => {
          timerRef.current = setTimeout(() => {
            if (counterRef.current !== myCount) return;
            setTextState("exit");
            timerRef.current = setTimeout(() => {
              if (counterRef.current !== myCount) return;
              setTextState("hidden");
              timerRef.current = setTimeout(() => {
                if (counterRef.current !== myCount) return;
                // Pick a new word (different from last)
                let again = FILLER_HINTS[Math.floor(Math.random() * FILLER_HINTS.length)];
                if (again === hintWordRef.current && FILLER_HINTS.length > 1) {
                  const rest = FILLER_HINTS.filter((h) => h !== again);
                  again = rest[Math.floor(Math.random() * rest.length)];
                }
                hintWordRef.current = again;
                timerRef.current = setTimeout(() => {
                  if (counterRef.current !== myCount) return;
                  typeText(again, () => {
                    timerRef.current = setTimeout(() => {
                      if (counterRef.current !== myCount) return;
                      setTextState("exit");
                      timerRef.current = setTimeout(() => {
                        if (counterRef.current !== myCount) return;
                        setTextState("hidden");
                        timerRef.current = setTimeout(() => {
                          if (counterRef.current !== myCount) return;
                          setTextState("hidden"); // stop cycling after one word
                        }, CYCLE_GAP);
                      }, EXIT_DURATION);
                    }, HOLD_DURATION);
                  });
                }, CYCLE_GAP);
              });
            }, EXIT_DURATION);
          }, HOLD_DURATION);
        });
      }, 100);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, phase]);

    if (textState === "hidden") return null;

    const showText = displayText || (text ? text[0] : "");

    return (
      <div className="absolute inset-0 z-40 flex items-center justify-center pointer-events-none overflow-hidden">
        <div
          key={hintKey}
          className={`
            relative font-black drop-shadow-2xl select-none text-white whitespace-nowrap
            ${textState === "typing" ? "animate-typein" : ""}
            ${textState === "hold"   ? "animate-float-hold" : ""}
            ${textState === "exit"   ? "animate-slide-out" : ""}
          `}
          style={{
            fontSize: phase === "preparing"
              ? "clamp(1.2rem, 5vw, 3.8rem)"
              : "clamp(1.8rem, 8vw, 6rem)",
            lineHeight: 1,
            color: "#deb7a6",
          }}
        >
          {showText}
        </div>
      </div>
    );
  }
);