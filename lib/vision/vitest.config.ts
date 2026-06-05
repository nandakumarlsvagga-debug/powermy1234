import { defineConfig } from "vitest/config";

export default defineConfig({
  // The package has no CSS or PostCSS pipeline; disable CSS handling so Vite
  // does not walk up and load an unrelated postcss.config.js from outside the
  // monorepo root.
  css: { postcss: { plugins: [] } },
});
