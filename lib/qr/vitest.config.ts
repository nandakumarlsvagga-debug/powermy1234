import { defineConfig } from "vitest/config";

export default defineConfig({
  // The package has no CSS or PostCSS pipeline; disable CSS handling so Vite
  // does not walk up and load an unrelated postcss.config.js from outside the
  // monorepo root.
  css: { postcss: { plugins: [] } },
  test: {
    // Rasterize + QR decode is heavier than a typical unit test. Give each
    // property-based test enough headroom so a small numRuns budget can
    // exercise the worst-case 256-character payload comfortably.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
