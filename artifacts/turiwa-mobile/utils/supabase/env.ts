import Constants from "expo-constants";

type Extra = {
  supabaseUrl?: string;
  supabasePublishableKey?: string;
  supabaseRestUrl?: string;
};

function normalizeProjectUrl(url: string): string {
  return url.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

export function getSupabaseUrl(): string {
  const extra = Constants.expoConfig?.extra as Extra | undefined;
  const raw =
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    extra?.supabaseUrl ||
    "";
  return raw ? normalizeProjectUrl(raw) : "";
}

export function getSupabaseRestUrl(): string {
  const extra = Constants.expoConfig?.extra as Extra | undefined;
  const rest =
    process.env.EXPO_PUBLIC_SUPABASE_REST_URL ||
    extra?.supabaseRestUrl ||
    "";
  if (rest) return rest.replace(/\/+$/, "");
  const url = getSupabaseUrl();
  return url ? `${url}/rest/v1` : "";
}

export function getSupabasePublishableKey(): string {
  const extra = Constants.expoConfig?.extra as Extra | undefined;
  return (
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    extra?.supabasePublishableKey ||
    ""
  );
}

export function assertSupabaseEnv(): { url: string; key: string } {
  const url = getSupabaseUrl();
  const key = getSupabasePublishableKey();
  if (!url || !key) {
    throw new Error(
      "Missing Supabase env. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY.",
    );
  }
  return { url, key };
}
