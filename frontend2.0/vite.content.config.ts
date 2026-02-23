import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Content-script build: IIFE bundle injected into Gmail
export default defineConfig({
  plugins: [react()],
  publicDir: false,
  build: {
    emptyOutDir: false,
    outDir: "dist",
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, "src/content.tsx"),
      output: {
        format: "iife",
        name: "GmailCopilotContent",
        entryFileNames: "content.js",
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith(".css")) {
            return "content.css";
          }
          return "[name][extname]";
        },
      },
    },
  },
});
