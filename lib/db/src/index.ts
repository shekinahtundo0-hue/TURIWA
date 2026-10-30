import fs from "node:fs";
import path from "node:path";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { getTableName, Table } from "drizzle-orm";
import pg from "pg";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { ensureSchema, seedIfEmpty } from "./bootstrap";
import type { AppDb } from "./client";
import { hardenHostedSchema } from "./harden";
import {
  databaseDriver,
  isPostgresUrl,
  postgresPoolConfig,
  resolveDatabaseUrl,
} from "./postgres";
import * as schema from "./schema";

const { Pool } = pg;

let _db: AppDb | null = null;
let _pool: pg.Pool | null = null;

/** Every table the app owns, read off the drizzle schema so the list cannot drift from it. */
function appTableNames(): string[] {
  return Object.values(schema)
    .filter((value) => value instanceof Table)
    .map((value) => getTableName(value as unknown as Table));
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const expected = Buffer.from(hash, "hex");
  if (expected.length !== next.length) return false;
  return timingSafeEqual(expected, next);
}

export function getDb(): AppDb {
  if (!_db) {
    throw new Error("Database is not ready. Call initDb() before using getDb().");
  }
  return _db;
}

export type InitDbOptions = {
  /** Fill a brand-new, empty database with the labelled demo chama. On by default for
   *  the developer's own file database, where it is what makes a fresh clone usable. */
  seedWhenEmpty?: boolean;
};

export async function initDb(options: InitDbOptions = {}): Promise<AppDb> {
  if (_db) return _db;

  const url = resolveDatabaseUrl();
  const isPostgres = isPostgresUrl(url);
  let db: AppDb;
  let pool: pg.Pool | null = null;

  if (isPostgres) {
    pool = new Pool(postgresPoolConfig(url));
    pool.on("error", (err) => {
      console.error("[db] pool connection error", err);
    });
    db = drizzlePg(pool, { schema });
  } else {
    const dataDir = url.startsWith("pglite://")
      ? url.slice("pglite://".length)
      : path.join("data", "turiwa");
    const abs = path.isAbsolute(dataDir) ? dataDir : path.resolve(process.cwd(), dataDir);
    fs.mkdirSync(abs, { recursive: true });
    const { PGlite } = await import("@electric-sql/pglite");
    const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
    const client = new PGlite(abs);
    await client.waitReady;
    db = drizzlePglite(client, { schema }) as unknown as AppDb;
  }

  // Nothing is cached until the schema and hardening have both succeeded: a retry after a failed
  // boot must start from the schema again, not query a half-initialised connection.
  try {
    await ensureSchema(db);
    // A Postgres this API reaches over the network is a Postgres someone else's key can reach too.
    // PGlite is in-process and has no such door, so only the pooled driver is hardened.
    if (pool) {
      const hardened = await hardenHostedSchema(pool, appTableNames());
      if (hardened.length > 0) {
        console.info(`[db] revoked public schema access from ${hardened.join(", ")}`);
      }
    }
  } catch (error) {
    await pool?.end().catch(() => {});
    throw error;
  }
  _db = db;
  _pool = pool;
  // The demo chama is a sample account whose password is in this repository. Seeding it
  // into a hosted database on first boot would put a signable-into stranger and its
  // fake group in front of real members, so the function entry opts out.
  if (options.seedWhenEmpty ?? true) {
    await seedIfEmpty(_db, hashPassword);
  }
  return _db;
}

export function getPool(): pg.Pool | null {
  return _pool;
}

export * from "./schema";
export {
  databaseDriver,
  isPostgresUrl,
  isSupabaseUrl,
  resolveDatabaseUrl,
} from "./postgres";
export type { AppDb } from "./client";
