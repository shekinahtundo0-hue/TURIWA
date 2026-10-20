import { databaseDriver, initDb, resolveDatabaseUrl } from "@workspace/db";
import app from "./app";
import { loadEnv } from "./lib/env";
import { linkExistingLoans } from "./lib/loanLedger";
import { startLiveBus } from "./lib/liveBus";
import { logger } from "./lib/logger";
import { getSupabaseUrl } from "./lib/supabase";

loadEnv();

const rawPort = process.env["PORT"] ?? "5000";
const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function main() {
  await initDb();

  // `--seed-demo` fills the database this process points at with the labelled synthetic
  // group and exits, so a pilot demo can be prepared on its own without ever touching
  // real records: DATABASE_URL selects the workspace, the flag fills it.
  if (process.argv.includes("--seed-demo")) {
    const { seedDemoWorkspace } = await import("./lib/seedDemo");
    logger.info(await seedDemoWorkspace());
    logger.info(await linkExistingLoans(), "Seeded loans linked into the group ledger");
    process.exit(0);
  }

  // Money a loan moved is ledger history, so the group's cash figure is the sum of
  // its entries. Runs once per loan: the entries are keyed to the loan's own id.
  const { linked, ungrouped } = await linkExistingLoans();
  if (linked > 0 || ungrouped > 0) {
    logger.info({ linked, ungrouped }, "Loan ledger reconciliation");
  }

  const databaseUrl = resolveDatabaseUrl();
  const driver = databaseDriver(databaseUrl);

  let live: "database" | "single-process" = "single-process";
  try {
    live = await startLiveBus();
  } catch (err) {
    // A missing change listener only means this process cannot hear other servers;
    // its own screens still update from the write response.
    logger.warn({ err }, "Live change bus unavailable, falling back to this process only");
  }

  logger.info(
    { driver, supabase: getSupabaseUrl() || null, live },
    "Database ready",
  );

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }
    logger.info({ port }, "Server listening");
  });
}

main().catch((err) => {
  logger.error({ err }, "Failed to start API server");
  process.exit(1);
});
