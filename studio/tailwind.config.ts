import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Fremio Studio — Primary: warna salem (brand fremio.id)
        // Base: #e0b7a9 (signature salem), dark end: #4a302b (warm rosewood)
        primary: {
          50:  "#fdf7f4",  // warm cream — brand bg
          100: "#fdf0eb",  // light blush — active nav bg
          200: "#f5e6e0",  // soft salmon
          300: "#ebcec4",  // medium-light
          400: "#e0b7a9",  // THE salem color — brand signature
          500: "#cc9580",  // medium
          600: "#c89585",  // medium-dark
          700: "#c07055",  // brand CTA
          800: "#8f5040",  // dark
          900: "#4a302b",  // warm rosewood — buttons, sidebar topbar
          950: "#2d1a16",  // deepest
        },
        // Fremio Studio — Accent: gold (komplementer salem)
        accent: {
          50:  "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#f5c030",
          500: "#d4a017",  // gold utama
          600: "#b07d0e",
          700: "#8a5e09",
          800: "#664406",
          900: "#4a2f04",
        },
        // Neutral untuk UI
        surface: {
          DEFAULT: "#f8fafc",
          card:    "#ffffff",
          hover:   "#f1f5f9",
          border:  "#e2e8f0",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      borderRadius: {
        "4xl": "2rem",
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(74,48,43,0.08), 0 1px 2px -1px rgba(74,48,43,0.06)",
        "card-md": "0 4px 12px 0 rgba(74,48,43,0.10), 0 2px 4px -2px rgba(74,48,43,0.06)",
      },
    },
  },
  plugins: [],
};

export default config;
