"use client";

interface BoothTimerProps {
  secondsLeft:  number;
  totalSeconds: number;
  posX?:        number;  // center X % of container — overrides default top-4 right-4
  posY?:        number;  // center Y % of container
  ringColor?:   string;  // hex, default "#ffffff"
  bgColor?:     string;  // hex, default "#000000"
}

const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

export function BoothTimer({ secondsLeft, totalSeconds, posX, posY, ringColor = "#ffffff", bgColor = "#000000" }: BoothTimerProps) {
  const SIZE        = 60;
  const RADIUS      = 23;
  const STROKE      = 3.5;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  const progress    = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  const dashOffset  = CIRCUMFERENCE * (1 - progress);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const timeStr = `${mins}:${secs.toString().padStart(2, "0")}`;

  // Ring colour: custom (normal) → amber (<30%) → red (<10%)
  const activeRingColor = progress > 0.3
    ? hexToRgba(ringColor, 0.92)
    : progress > 0.1
    ? "#fbbf24"
    : "#f87171";

  const bgRgba = hexToRgba(bgColor, 0.28);

  const posStyle = (posX !== undefined && posY !== undefined)
    ? { left: `${posX}%`, top: `${posY}%`, transform: "translate(-50%,-50%)" }
    : { top: "1rem", right: "1rem" };

  return (
    <div
      className="absolute z-50 select-none pointer-events-none"
      style={posStyle}
      aria-label={`Sisa waktu: ${timeStr}`}
    >
      <div className="relative flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
        {/* Frosted backdrop */}
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: bgRgba, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
        />

        {/* Track + progress ring */}
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="absolute inset-0"
          style={{ transform: "rotate(-90deg)" }}
        >
          {/* Track */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth={STROKE}
          />
          {/* Progress arc */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={activeRingColor}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            style={{
              transition: "stroke-dashoffset 0.85s linear, stroke 0.4s ease",
            }}
          />
        </svg>

        {/* Time text */}
        <span
          className="relative font-bold tabular-nums leading-none"
          style={{ color: activeRingColor, fontSize: "11px", transition: "color 0.4s ease" }}
        >
          {timeStr}
        </span>
      </div>
    </div>
  );
}
