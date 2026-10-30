import type pg from "pg";

function fromConnectionParts(): string | null {
  const password = process.env.SUPABASE_DB_PASSWORD ?? process.env.POSTGRES_PASSWORD;
  const host = process.env.SUPABASE_DB_HOST;
  if (!password || !host) return null;
  const user = process.env.SUPABASE_DB_USER || "postgres";
  const port = process.env.SUPABASE_DB_PORT || "5432";
  const database = process.env.SUPABASE_DB_NAME || "postgres";
  return `postgresql://${user}:${encodeURIComponent(password)}@${host}:${port}/${database}?sslmode=require`;
}

export function resolveDatabaseUrl(): string {
  const direct =
    process.env.DATABASE_URL ||
    process.env.SUPABASE_DB_URL ||
    process.env.SUPABASE_DATABASE_URL;
  if (direct && (direct.startsWith("postgres://") || direct.startsWith("postgresql://"))) {
    return direct;
  }
  return fromConnectionParts() ?? direct ?? "pglite://data/turiwa";
}

export function isPostgresUrl(url: string): boolean {
  return url.startsWith("postgres://") || url.startsWith("postgresql://");
}

export function isSupabaseUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes("supabase.co") ||
    lower.includes("pooler.supabase.com") ||
    lower.includes("supabase.net")
  );
}

export function databaseDriver(url: string): "supabase" | "postgres" | "pglite" {
  if (!isPostgresUrl(url)) return "pglite";
  if (isSupabaseUrl(url)) return "supabase";
  return "postgres";
}

export function postgresPoolConfig(url: string): pg.PoolConfig {
  const lower = url.toLowerCase();
  const wantsSsl =
    !lower.includes("sslmode=disable") &&
    (isSupabaseUrl(url) ||
      process.env.DATABASE_SSL === "true" ||
      lower.includes("sslmode=require") ||
      lower.includes("sslmode=verify-full") ||
      lower.includes("sslmode=prefer"));

  // Supabase endpoints present certificates that Node's default CA store cannot verify inside a
  // Worker, so TLS is enabled without strict verification. The transaction pooler (port 6543)
  // advertises a public CA but `pg` on Workers still fails verification; disabling rejection is
  // the only path that has produced a live connection so far.
  const isWorker = onCloudflareWorkers();
  const ssl = wantsSsl ? { rejectUnauthorized: false } : undefined;

  return {
    connectionString: url,
    max: Number(process.env.DATABASE_POOL_MAX ?? 10) || 10,
    ssl,
    // A Worker may not use a socket opened while it served a different request, so there a
    // connection is closed after one use instead of idling in the pool for the next request.
    ...(isWorker ? { maxUses: 1 } : {}),
  };
}

function onCloudflareWorkers(): boolean {
  return globalThis.navigator?.userAgent === "Cloudflare-Workers";
}
