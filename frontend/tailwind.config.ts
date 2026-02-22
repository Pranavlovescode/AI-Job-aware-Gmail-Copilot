import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}", "./dashboard.html"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        slateBrand: {
          50: "#f7f9fc",
          100: "#eef3fb",
          200: "#dbe7f5",
          300: "#bdd1ea",
          700: "#2b405f",
          900: "#101d2f",
        },
      },
      boxShadow: {
        panel: "0 22px 40px rgba(16, 29, 47, 0.18)",
      },
    },
  },
  plugins: [],
} satisfies Config;
