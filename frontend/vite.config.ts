import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: true,
    outDir: "dist",
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, "src/background.ts"),
        dashboard: path.resolve(__dirname, "dashboard.html"),
      },
      output: {
        entryFileNames: "[name].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});
