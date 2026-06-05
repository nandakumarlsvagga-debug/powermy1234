import { defineConfig } from "vitest/config";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/dummy";
process.env.SHARE_CARD_DATABASE_URL = process.env.SHARE_CARD_DATABASE_URL || "postgresql://localhost:5432/dummy";
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy";

export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    // Rasterizing a card and decoding the embedded QR is heavier than a
    // typical unit test. Give each property-based test enough headroom so a
    // small numRuns budget can exercise all three ratios comfortably.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
