import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        halo: {
          base: "#050508",
          bg: "#050508",
          surface: "#151620",
          muted: "#1E2030",
          border: "rgba(255,255,255,0.08)",
          text: "rgba(255,255,255,0.92)",
          subtle: "rgba(255,255,255,0.5)",
          accent: "#8B5CF6",
          accent2: "#A78BFA",
          teal: "#06B6D4",
        },
      },
      fontFamily: {
        display: ["var(--font-outfit)", "sans-serif"],
        body: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
