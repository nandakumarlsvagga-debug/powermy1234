import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

function readEnv(): { url: string; serviceRoleKey: string } {
  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url) {
    throw new Error("SUPABASE_URL must be set for the share-card server.");
  }
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY must be set for the share-card server.");
  }
  return { url, serviceRoleKey };
}

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) {
    return cached;
  }
  const { url, serviceRoleKey } = readEnv();
  cached = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      headers: {
        "X-Client-Info": "powerlvl-share-card",
      },
    },
  });
  return cached;
}
