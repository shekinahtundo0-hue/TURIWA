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
if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
if (!process.env.DATABASE_POOL_MAX) process.env.DATABASE_POOL_MAX = "2";

/** Raised when the deploy has no real database to write to. Both hosts answer 503. */
export class DatabaseNotConfigured extends Error {}

/** The one route no serverless host can serve, and what it says instead. */
export const LIVE_UPDATES_REFUSED =
  "Live updates are not available on this host. The app refreshes by polling instead.";

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
    throw new DatabaseNotConfigured(
      "No database is configured. Set DATABASE_URL (or SUPABASE_DB_HOST and SUPABASE_DB_PASSWORD) " +
        "to the Supabase connection string — the embedded file database cannot persist here.",
    );
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
