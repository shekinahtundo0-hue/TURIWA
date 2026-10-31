const RUNTIME_ENV_NAMES = [
  "DATABASE_URL",
  "SUPABASE_DB_URL",
  "SUPABASE_DATABASE_URL",
  "SUPABASE_DB_HOST",
  "SUPABASE_DB_PORT",
  "SUPABASE_DB_NAME",
  "SUPABASE_DB_USER",
  "SUPABASE_DB_PASSWORD",
  "POSTGRES_PASSWORD",
  "DATABASE_SSL",
  "DATABASE_POOL_MAX",
  "FIREBASE_API_KEY",
  "FIREBASE_PROJECT_ID",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_ANDROID_CLIENT_ID",
] as const;

export function applyRuntimeEnvironment(env: Record<string, unknown>): void {
  for (const name of RUNTIME_ENV_NAMES) {
    const value = env[name];
    if (typeof value === "string" && value !== "") {
      process.env[name] = value;
    }
  }
}
