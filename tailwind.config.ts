import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        junior: {
          50: "#e8f0fe",
          100: "#d3e3fd",
          200: "#a8c7fa",
          300: "#7cacf8",
          400: "#4285f4",
          500: "#1a73e8",
          600: "#0b57d0",
          700: "#0842a0",
          800: "#062e6f",
          900: "#041e49",
          950: "#02122c",
        },
        google: {
          blue: "#4285F4",
          red: "#EA4335",
          yellow: "#FBBC05",
          green: "#34A853",
          surface: "#F8FAFD",
          pill: "#D3E3FD",
        },
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
export default config;
