import { defineConfig } from "vitest/config";

process.env.DATABASE_URL = process.env.DATABASE_URL || "postgresql://localhost:5432/dummy";
process.env.SESSION_SIGNING_KEY = process.env.SESSION_SIGNING_KEY || "a".repeat(32);
process.env.SUPABASE_URL = process.env.SUPABASE_URL || "https://dummy.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy_key";
process.env.APP_BASE_URL = process.env.APP_BASE_URL || "http://localhost:5000";

export default defineConfig({
  css: { postcss: { plugins: [] } },
});
