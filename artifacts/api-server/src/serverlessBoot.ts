import type { Express } from "express";

// Both serverless hosts — Netlify's v2 function and Vercel's Node function — open the
// database, create the tables and reconcile the loan ledger once per warm container, before
// the first request is answered. They share that boot here so a rule added for one host
// cannot silently be missing on the other.
//
// These two must be set before the imports below are evaluated: the logger reads NODE_ENV at
// module scope, and anything other than production makes pino spawn a log pretty-printer over
// a worker thread, which a serverless container has no business doing. A container serving one
// request at a time also has no use for ten database connections, and on Supabase the budget is
// shared across every container the host spins up. An explicit site variable still wins.
if (!process.env.NODE_ENV) {
  // Wrangler's bundler may replace `process.env.NODE_ENV` with a compile-time constant, so
  // write through a local reference to avoid an assignment-to-constant error in that case.
  const env = process.env;
  if (!env.NODE_ENV) env.NODE_ENV = "production";
}
if (!process.env.DATABASE_POOL_MAX) process.env.DATABASE_POOL_MAX = "2";

/** Raised when the deploy has no real database to write to. Both hosts answer 503. */
export class DatabaseNotConfigured extends Error {}

// Names only, never values: a 503 that lists what the container can see turns "why is the site
// refusing?" into one identifiable gap, which is otherwise guesswork from outside the host.
const DATABASE_ENV_NAMES = [
  "DATABASE_URL",
  "SUPABASE_DB_URL",
  "SUPABASE_DATABASE_URL",
  "SUPABASE_DB_HOST",
  "SUPABASE_DB_USER",
  "SUPABASE_DB_PASSWORD",
  "POSTGRES_PASSWORD",
] as const;

function databaseConfigReport(): string {
  const present = DATABASE_ENV_NAMES.filter((name) => process.env[name]);
  const missing = DATABASE_ENV_NAMES.filter((name) => !process.env[name]);
  return (
    "No database is configured, so no member's money can be read or written. Set DATABASE_URL, " +
    "or SUPABASE_DB_HOST together with SUPABASE_DB_PASSWORD (or POSTGRES_PASSWORD). On the " +
    "Supabase pooler SUPABASE_DB_USER must carry the project ref (postgres.<ref>), because the " +
    "plain postgres default is not a tenant. " +
    `This container sees ${present.length ? `only ${present.join(", ")}` : "none of them"}` +
    `${missing.length ? `; still missing: ${missing.join(", ")}` : ""}. ` +
    "A value added on the host after the last deploy is not visible here — redeploy for it to apply."
  );
}

/** The one route no serverless host can serve, and what it says instead. */
export const LIVE_UPDATES_REFUSED =
  "Live updates are not available on this host. The app refreshes by polling instead.";

// A SQLSTATE is a standard condition name, so quoting it tells an operator *what kind* of failure
// this was without revealing a single identifier. The full driver message is the SQL statement —
// our table and column layout — and belongs in the host's logs, not in a stranger's response.
const DRIVER_ERROR_HINTS: Record<string, string> = {
  "08001": "the database could not be reached",
  "08P01": "the database refused the connection handshake",
  "28000": "the database refused this user",
  "28P01": "the database rejected its password",
  "3D000": "the database name does not exist",
  "3F000": "the schema does not exist",
  "42501": "this database user lacks a privilege the app needs",
  "42883": "a function the app's policies call is missing",
  "42P01": "a table the app expects is missing",
  "42P07": "an object the app creates already exists",
  "53300": "the database has no free connections",
  "57P01": "the database closed the connection",
};

/** Walk a wrapped error for the one driver code it carries, then name the kind of failure.
 *  `undefined` means nothing safe can be said, and the caller keeps the generic sentence. */
export function driverErrorHint(err: unknown): string | undefined {
  let node = err as { code?: unknown; cause?: unknown } | null | undefined;
  for (let depth = 0; node && depth < 5; depth += 1, node = node.cause as typeof node) {
    const code = typeof node.code === "string" ? node.code : "";
    const hint = DRIVER_ERROR_HINTS[code];
    // System-level codes (ECONNREFUSED, ETIMEDOUT) name no schema and no host here.
    if (/^E[A-Z_]+$/.test(code)) return `connection error ${code}`;
    if (hint) return `database error ${code} (${hint})`;
  }
  return undefined;
}

/** What a 500 is allowed to say: the kind of failure, never the statement that failed. */
/** For the host's private log only: which statement failed, cut before Drizzle's `params:` so a
 *  member's phone number or password hash bound into a query never reaches the log. */
export function failedStatement(err: Error): string {
  return err.message.split(/\n?params:/)[0].replace(/\s+/g, " ").slice(0, 160);
}

export function publicFailureMessage(err: unknown): string {
  const hint = driverErrorHint(err);
  return hint
    ? `The server could not complete this request: ${hint}. The full reason is in this host's function logs.`
    : "The server could not complete this request. The reason is in this host's function logs.";
}

let warming: Promise<Express> | null = null;

export function bootServer(): Promise<Express> {
  if (!warming) {
    warming = open().catch((err: unknown) => {
      // A failed boot must not be cached: the next request gets a fresh attempt, so a
      // database that was briefly unreachable heals without a redeploy.
      warming = null;
      throw err;
    });
  }
  return warming;
}

async function open(): Promise<Express> {
  const [{ default: app }, db, { linkExistingLoans }, { logger }] = await Promise.all([
    import("./app"),
    import("@workspace/db"),
    import("./lib/loanLedger"),
    import("./lib/logger"),
  ]);

  const url = db.resolveDatabaseUrl();
  const driver = db.databaseDriver(url);
  if (driver === "pglite") {
    throw new DatabaseNotConfigured(databaseConfigReport());
  }

  // A hosted database that starts empty stays empty: the demo chama in the schema
  // bootstrap has a published password, and a sample account full of fake groups is
  // the opposite of what a real member's first screen should show.
  await db.initDb({ seedWhenEmpty: false });

  // Money a loan moved is ledger history, so the group's cash figure is the sum of its
  // entries. Idempotent: the entries are keyed to the loan's own id, so a container that
  // warms twice a day cannot double-count.
  const { linked, ungrouped } = await linkExistingLoans();
  logger.info({ driver, linked, ungrouped }, "serverless API ready");

  // The live change bus is deliberately not started here: it keeps a dedicated Postgres
  // connection open to hear LISTEN notifications, and there is no long-lived request to
  // carry a change to. The stream route says so, and the app polls.

  return app;
}
