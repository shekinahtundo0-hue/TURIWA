import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertSupabaseEnv } from "./env";

let client: SupabaseClient | null = null;

export function createClient(): SupabaseClient {
  if (client) return client;
  const { url, key } = assertSupabaseEnv();
  client = createSupabaseClient(url, key, {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  });
  return client;
}
