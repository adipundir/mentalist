import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * One accent, three fonts, no radius to speak of. Everything here exists to keep the app
 * looking like a 1947 case file rather than a dashboard.
 */
const config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: { center: true, padding: "1.5rem", screens: { "2xl": "1360px" } },
    extend: {
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        type: ["var(--font-type)", "ui-monospace", "monospace"],
        body: ["var(--font-body)", "ui-serif", "Georgia", "serif"],
      },
      colors: {
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          2: "rgb(var(--ink-2) / <alpha-value>)",
          3: "rgb(var(--ink-3) / <alpha-value>)",
        },
        bone: {
          DEFAULT: "rgb(var(--bone) / <alpha-value>)",
          dim: "rgb(var(--bone-dim) / <alpha-value>)",
        },
        blood: {
          DEFAULT: "rgb(var(--blood) / <alpha-value>)",
          hot: "rgb(var(--blood-hot) / <alpha-value>)",
        },
        brass: "rgb(var(--brass) / <alpha-value>)",
        phosphor: "rgb(var(--phosphor) / <alpha-value>)",
        background: "rgb(var(--ink) / <alpha-value>)",
        foreground: "rgb(var(--bone) / <alpha-value>)",
      },
      borderRadius: { lg: "3px", md: "2px", sm: "1px" },
      letterSpacing: { file: "0.22em" },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;

export default config;
