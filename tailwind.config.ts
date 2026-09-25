import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        halo: {
          base: "#060509",
          bg: "rgba(255,255,255,0.045)",
          surface: "rgba(255,255,255,0.05)",
          muted: "rgba(255,255,255,0.06)",
          border: "rgba(255,255,255,0.14)",
          text: "rgba(255,255,255,0.94)",
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
