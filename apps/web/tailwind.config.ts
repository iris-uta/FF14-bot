import type { Config } from "tailwindcss";

export default {
  content: [
    "./src/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
      fontFamily: {
        sans: ["system-ui", "-apple-system", "Helvetica Neue", "Arial", "Hiragino Kaku Gothic Pro", "Meiryo", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
