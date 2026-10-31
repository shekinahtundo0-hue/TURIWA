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

function onHyperdrive(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().endsWith(".hyperdrive.local");
  } catch {
    return false;
  }
}

export function postgresPoolConfig(url: string): pg.PoolConfig {
  const lower = url.toLowerCase();
  // Hyperdrive terminates TLS at the origin, where Supabase's own CA is installed, and serves
  // the Worker over a private plaintext socket. Asking pg to start its own SSLRequest there
  // would be a second, unsupported handshake.
  const viaHyperdrive = onHyperdrive(url);
  const wantsSsl =
    !viaHyperdrive &&
    !lower.includes("sslmode=disable") &&
    (isSupabaseUrl(url) ||
      process.env.DATABASE_SSL === "true" ||
      lower.includes("sslmode=require") ||
      lower.includes("sslmode=verify-full") ||
      lower.includes("sslmode=prefer"));

  // The direct Supabase host and the pooler both serve a certificate signed by "Supabase Root
  // 2021 CA". Node outside a Worker trusts it once asked not to verify; workerd ignores
  // `rejectUnauthorized` and rejects the chain outright, which is why a Worker reaches Postgres
  // through Hyperdrive instead.
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
