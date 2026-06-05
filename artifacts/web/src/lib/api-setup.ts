import { setBaseUrl, setAuthTokenGetter } from "@workspace/api-client-react";
import { supabase } from "./supabase.js";

// Point API requests to our dev server proxy "/api"
setBaseUrl("/api");

// Wire Supabase session token to automatically populate Bearer Auth headers
setAuthTokenGetter(async () => {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ?? null;
});
