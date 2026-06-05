import { defineConfig } from "vitest/config";

export default defineConfig({
  // The package has no CSS or PostCSS pipeline; disable CSS handling so Vite
  // does not walk up and load an unrelated postcss.config.js from outside the
  // monorepo root.
  css: { postcss: { plugins: [] } },
  test: {
    // Sharp encodes (especially AVIF) are the dominant cost in these tests
    // and can take many seconds per case on slower runners. The AVIF +
    // WebP encode ladder in `encodeWithSizeBudget` runs up to 10 encodes
    // per call, so the happy-path `beforeAll` needs a generous budget.
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
