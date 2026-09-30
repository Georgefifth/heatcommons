import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves this repository from /heatcommons/.
  base: process.env.GITHUB_PAGES === "true" ? "/heatcommons/" : "/",
  plugins: [react()],
});
