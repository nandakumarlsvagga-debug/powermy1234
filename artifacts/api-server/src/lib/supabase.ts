/**
 * Server-side Supabase client (service-role).
 *
 * The API server never queries Postgres with the user's JWT — it validates
 * the JWT itself (see `./auth.ts`) and uses the service-role key for all
 * privileged operations: Storage signed-URL generation, Auth admin actions
 * (account deletion), and any direct PostgREST writes that bypass RLS.
 *
 * The service role MUST NEVER be sent to the browser. The bundle scan in
 * `scripts/src/bundle-scan.ts` rejects any client bundle that contains
 * `SUPABASE_SERVICE_ROLE_KEY` (Requirement 14.3).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

function readEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url) {
    throw new Error("SUPABASE_URL must be set for the API server.");
  }
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY must be set for the API server.",
    );
  }
  return { url, serviceRoleKey };
}

/**
 * Return a process-wide singleton service-role Supabase client. Lazy so
 * boot does not crash in environments where Supabase env vars are not yet
 * configured (e.g. unit tests of unrelated routes).
 */
export function getSupabaseAdmin(): SupabaseClient {
  if (cached) {
    return cached;
  }
  const { url, serviceRoleKey } = readEnv();
  cached = createClient(url, serviceRoleKey, {
    auth: {
      // Service-role tokens are not user sessions; never persist or refresh.
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "powerlvl-api-server",
      },
    },
  });
  return cached;
}

/**
 * Test seam: drop the cached client so the next `getSupabaseAdmin()` call
 * re-reads env vars. Not exported from `index.ts` of the package; only used
 * by integration tests.
 */
export function __resetSupabaseAdminForTests(): void {
  cached = null;
}
