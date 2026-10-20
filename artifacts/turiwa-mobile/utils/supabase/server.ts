import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseEnv } from "./env";

/**
 * Server-style client for this Expo app.
 * Next.js cookie helpers from @supabase/ssr do not apply here.
 */
export function createClient(): SupabaseClient {
  const { url, key } = assertSupabaseEnv();
  return createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}
