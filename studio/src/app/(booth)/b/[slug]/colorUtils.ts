/** Returns true if the hex color is perceived as light (i.e. use dark text on it) */
export function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  if (c.length !== 6) return false;
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
}

/** Adaptive text colors based on a background hex */
export function getAdaptiveColors(bgHex: string) {
  const light = isLightColor(bgHex);
  return {
    light,
    textPrimary:   light ? "rgba(0,0,0,0.85)"  : "rgba(255,255,255,0.95)",
    textSecondary: light ? "rgba(0,0,0,0.45)"  : "rgba(255,255,255,0.55)",
    textTertiary:  light ? "rgba(0,0,0,0.30)"  : "rgba(255,255,255,0.30)",
    surfaceBg:     light ? "rgba(0,0,0,0.06)"  : "rgba(255,255,255,0.10)",
    surfaceBorder: light ? "rgba(0,0,0,0.10)"  : "rgba(255,255,255,0.14)",
    surfaceDark:   light ? "rgba(0,0,0,0.12)"  : "rgba(0,0,0,0.30)",
  };
}
