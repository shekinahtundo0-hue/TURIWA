import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { Socket } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

// Standalone: no server, routes, shared harness, dotenv, or existing database.
// Run with: node --test artifacts/api-server/loanLedger.regression.test.mjs
const apiDir = path.dirname(fileURLToPath(import.meta.url));

test("loan ledger isolated PGlite regressions", { timeout: 120_000 }, async (t) => {
  const originalEnv = { ...process.env };
  const dataDir = await mkdtemp(path.join(tmpdir(), "loan-ledger-db-"));
  // Keep the bundle near node_modules so PGlite can load its own WASM assets.
  const buildDir = await mkdtemp(path.join(apiDir, ".loan-ledger-regression-"));
  let db;
  t.after(async () => {
    try {
      await db?.$client.close();
    } finally {
      await rm(buildDir, { recursive: true, force: true });
      await rm(dataDir, { recursive: true, force: true });
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, originalEnv);
    }
  });

  for (const key of Object.keys(process.env)) {
    if (/^(SUPABASE_|POSTGRES_|PG)/.test(key)) delete process.env[key];
  }
  Object.assign(process.env, {
    DATABASE_URL: `pglite://${dataDir}`,
    HOST: "127.0.0.1",
    SUPABASE_URL: "http://127.0.0.1:9",
    NODE_ENV: "production", // Disable pino's development worker, not DB isolation.
    LOG_LEVEL: "silent",
  });
  // Endpoints are explicitly loopback-only; this suite needs no sockets at all.
  // Fail closed even if a future import accidentally tries a pooled/live database.
  t.mock.method(Socket.prototype, "connect", () => {
    throw new Error("Isolated ledger regression forbids network connections");
  });
  t.mock.method(globalThis, "fetch", () => {
    throw new Error("Isolated ledger regression forbids network fetches");
  });

  const bundle = path.join(buildDir, "ledger.cjs");
  await build({
    stdin: {
      contents: `
        export * from "./src/lib/loanLedger.ts";
        export * from "@workspace/db";
        export { logger } from "./src/lib/logger.ts";
        export { eq, sql } from "drizzle-orm";
      `,
      resolveDir: apiDir,
      sourcefile: "loan-ledger-regression-entry.ts",
      loader: "ts",
    },
    outfile: bundle,
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["@electric-sql/pglite", "pg-native"],
    logLevel: "silent",
  });
  const {
    initDb, resolveDatabaseUrl, getPool, contributionsTable, loansTable, usersTable,
    recordLoanDisbursement, linkExistingLoans, logger, eq, sql,
  } = createRequire(import.meta.url)(bundle);
  assert.equal(resolveDatabaseUrl(), `pglite://${dataDir}`);
  assert.equal(process.env.HOST, "127.0.0.1");
  db = await initDb({ seedWhenEmpty: false });
  assert.equal(getPool(), null);

  const fixtureTransaction = db.transaction.bind(db);
  async function legacyFixture(write) {
    // These fixtures predate today's loan-write guards (unknown statuses, missing
    // groups, old terms). Bypass triggers ONLY while importing into this fresh
    // PGlite fixture transaction; SET LOCAL resets before reconciliation runs.
    return fixtureTransaction(async (tx) => {
      await tx.execute(sql`SET LOCAL session_replication_role = replica`);
      return write(tx);
    });
  }

  async function loan(id, overrides = {}) {
    const [row] = await legacyFixture((tx) => tx.insert(loansTable).values({
      id,
      userId: "borrower",
      circleId: "circle-isolated",
      principal: 1000,
      totalPayable: 1200,
      balance: 750,
      monthlyRepayment: 200,
      months: 6,
      interestRate: 5,
      interestPeriod: "Month",
      dueDate: "On file",
      purpose: "Regression fixture",
      status: "Active",
      ...overrides,
    }).returning());
    return row;
  }

  async function entry(id, loanId, type, amount, overrides = {}) {
    await db.insert(contributionsTable).values({
      id, loanId, type, amount,
      circleId: "circle-isolated",
      userId: "borrower",
      date: "Original date",
      note: "Existing journal; preserve verbatim",
      status: "Complete",
      member: "Original member",
      recordedBy: "original-recorder",
      method: "Cash",
      reference: "original-reference",
      ...overrides,
    });
  }

  const journal = () => db.select().from(contributionsTable).orderBy(contributionsTable.id);
  const summary = (linked = 0, ungrouped = 0, ambiguous = 0) => ({ linked, ungrouped, ambiguous });

  await t.test("fresh database has no demo seed", async () => {
    assert.deepEqual(await db.select().from(usersTable), []);
    assert.deepEqual(await db.select().from(loansTable), []);
    assert.deepEqual(await journal(), []);
  });

  t.beforeEach(async () => {
    await db.execute(sql`TRUNCATE contributions, loans, users, circles CASCADE`);
    await db.insert(usersTable).values({ id: "borrower", name: "Isolated Borrower" });
  });

  await t.test("Rejected, Pending and unknown statuses never pay out or count as ungrouped", async () => {
    const excluded = ["Rejected", "Pending", "Approved", "Paid Off", "active", "Unknown", ""];
    for (const [index, status] of excluded.entries()) {
      const grouped = await loan(`excluded-${index}`, { status });
      const ungrouped = await loan(`ungrouped-${index}`, { status, circleId: null });
      assert.equal(await recordLoanDisbursement(grouped, "Just now"), false, status);
      assert.equal(await recordLoanDisbursement(ungrouped, "Just now"), false, status);
    }
    for (const status of ["Active", "Paid off"]) {
      const ungrouped = await loan(`funded-ungrouped-${status}`, { status, circleId: null });
      assert.equal(await recordLoanDisbursement(ungrouped, "Just now"), false);
    }
    assert.deepEqual(await linkExistingLoans(), summary(0, 2));
    assert.deepEqual(await journal(), []);
  });

  await t.test("direct funded payouts remain idempotent and retain original audit", async () => {
    for (const status of ["Active", "Paid off"]) {
      const row = await loan(`direct-${status}`, { status, balance: status === "Paid off" ? 0 : 750 });
      assert.equal(await recordLoanDisbursement(row, "Just now", db, {
        recordedBy: "first-recorder", method: " Cash ", reference: " receipt-1 ",
      }), true);
      assert.equal(await recordLoanDisbursement(row, "Later", db, { recordedBy: "retry" }), false);
    }
    const rows = await journal();
    assert.equal(rows.length, 2);
    for (const row of rows) {
      assert.equal(row.type, "LoanDisbursement");
      assert.equal(row.amount, 1000);
      assert.equal(row.member, "Isolated Borrower");
      assert.equal(row.recordedBy, "first-recorder");
      assert.equal(row.method, "Cash");
      assert.equal(row.reference, "receipt-1");
      assert.equal(row.date, "Just now");
    }
  });

  await t.test("fresh legacy pairs use one locked transaction, including member lookups; repeats do nothing", async (t) => {
    await loan("legacy-active");
    await loan("legacy-paid", { status: "Paid off", balance: 0 });
    await loan("legacy-unpaid", { balance: 1200 });
    await loan("legacy-no-negative", { balance: 1300 });
    // An unrelated contribution is not a loan payout/repayment history.
    await entry("ordinary-contribution", "legacy-active", "Contribution", 25);
    const unrelated = (await journal())[0];
    const originalTransaction = db.transaction.bind(db);
    const originalSelect = db.select.bind(db);
    let inTransaction = false;
    const transactions = [];
    t.mock.method(db, "select", (...args) => {
      assert.equal(inTransaction, false, "memberName and journal reads must use tx, not db");
      return originalSelect(...args);
    });
    t.mock.method(db, "insert", () => assert.fail("Reconciliation inserts must use tx"));
    t.mock.method(db, "transaction", (callback, ...options) => originalTransaction(async (tx) => {
      const statements = [];
      transactions.push(statements);
      const prepare = tx.session.prepareQuery.bind(tx.session);
      t.mock.method(tx.session, "prepareQuery", (query, ...args) => {
        statements.push(query.sql);
        return prepare(query, ...args);
      });
      inTransaction = true;
      try {
        return await callback(tx);
      } finally {
        inTransaction = false;
      }
    }, ...options));

    assert.deepEqual(await linkExistingLoans(), summary(4));
    assert.equal(transactions.length, 4);
    for (const statements of transactions) {
      assert.match(statements[0], /from "loans".*for update/i);
      assert.ok(statements.some((query) => /from "users"/.test(query)), "member lookup uses this tx");
    }
    const rows = await journal();
    assert.equal(rows.length, 7);
    const amounts = Object.fromEntries(rows.map((row) => [row.id, row.amount]));
    assert.deepEqual(amounts, {
      "loan-disb-legacy-active": 1000,
      "loan-disb-legacy-no-negative": 1000,
      "loan-disb-legacy-paid": 1000,
      "loan-disb-legacy-unpaid": 1000,
      "loan-repaid-legacy-active": 450,
      "loan-repaid-legacy-paid": 1200,
      "ordinary-contribution": 25,
    });
    assert.deepEqual(rows.find((row) => row.id === unrelated.id), unrelated);
    for (const row of rows.filter((row) => row.id !== unrelated.id)) {
      assert.equal(row.circleId, "circle-isolated");
      assert.equal(row.userId, "borrower");
      assert.equal(row.member, "Isolated Borrower");
      assert.equal(row.date, "On file");
      assert.equal(row.status, "Complete");
      assert.equal(row.recordedBy, null);
      assert.equal(row.method, null);
      assert.equal(row.reference, null);
      assert.equal(row.type, row.id.startsWith("loan-disb-") ? "LoanDisbursement" : "Repayment");
      assert.ok(row.id.endsWith(row.loanId));
    }
    assert.deepEqual(await linkExistingLoans(), summary());
    assert.deepEqual(await journal(), rows);
  });

  await t.test("existing journal records are untouched; partial histories are reported, not invented", async (t) => {
    for (const id of ["payout-only", "repayment-only", "complete", "old-payout", "old-repayment"]) {
      await loan(id);
    }
    await loan("not-yet-repaid", { balance: 1200 });
    await entry("custom-payout", "payout-only", "LoanDisbursement", 1000);
    await entry("custom-repayment", "repayment-only", "Repayment", 50);
    await entry("complete-payout", "complete", "LoanDisbursement", 1000);
    // Its balance is not evidence for another 400 of repayments; never invent that gap.
    await entry("complete-payment", "complete", "Repayment", 50);
    await entry("loan-disb-old-payout", null, "LoanDisbursement", 1000);
    await entry("loan-repaid-old-repayment", null, "Repayment", 50);
    await entry("unpaid-payout", "not-yet-repaid", "LoanDisbursement", 1000);
    const before = await journal();
    const warn = t.mock.method(logger, "warn", () => {});
    assert.deepEqual(await linkExistingLoans(), summary(0, 0, 4));
    assert.deepEqual(warn.mock.calls.map(({ arguments: [fields] }) => fields.loanId).sort(),
      ["old-payout", "old-repayment", "payout-only", "repayment-only"]);
    assert.deepEqual(await journal(), before);
    assert.deepEqual(await linkExistingLoans(), summary(0, 0, 4));
    assert.deepEqual(await journal(), before);
  });

  await t.test("eligibility and ungrouped reporting re-read the row after the scan", async (t) => {
    const originalTransaction = db.transaction.bind(db);
    let change;
    t.mock.method(db, "transaction", async (callback, ...options) => {
      await change();
      return originalTransaction(callback, ...options);
    });
    for (const [id, update, expected] of [
      ["now-rejected", { status: "Rejected" }, summary()],
      ["now-pending", { status: "Pending" }, summary()],
      ["now-unknown", { status: "Unknown" }, summary()],
      ["now-ungrouped", { circleId: null }, summary(0, 1)],
    ]) {
      await db.delete(loansTable);
      await loan(id);
      change = () => legacyFixture((tx) => tx.update(loansTable).set(update).where(eq(loansTable.id, id)));
      assert.deepEqual(await linkExistingLoans(), expected);
      assert.deepEqual(await journal(), []);
    }
    await db.delete(loansTable);
    await loan("now-deleted");
    change = () => db.delete(loansTable);
    assert.deepEqual(await linkExistingLoans(), summary());
    assert.deepEqual(await journal(), []);
  });

  await t.test("amounts, group and member come from the current locked row, not the scan", async (t) => {
    await loan("changed");
    await db.insert(usersTable).values({ id: "new-borrower", name: "Current Borrower" });
    const originalTransaction = db.transaction.bind(db);
    t.mock.method(db, "transaction", async (callback, ...options) => {
      await legacyFixture((tx) => tx.update(loansTable).set({
        status: "Paid off", principal: 2000, totalPayable: 2400, balance: 0,
        circleId: "current-circle", userId: "new-borrower", purpose: "Current purpose",
      }).where(eq(loansTable.id, "changed")));
      return originalTransaction(callback, ...options);
    });
    assert.deepEqual(await linkExistingLoans(), summary(1));
    const rows = await journal();
    assert.deepEqual(rows.map((row) => row.amount), [2000, 2400]);
    for (const row of rows) {
      assert.equal(row.circleId, "current-circle");
      assert.equal(row.userId, "new-borrower");
      assert.equal(row.member, "Current Borrower");
      assert.match(row.note, /Current purpose/);
    }
  });

  await t.test("injected repayment insert failure rolls back its payout and allows a clean retry", async () => {
    const before = await loan("rollback");
    await db.execute(sql.raw(`
      CREATE FUNCTION fail_legacy_repayment() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.id = 'loan-repaid-rollback' THEN
          IF NOT EXISTS (SELECT 1 FROM contributions WHERE id = 'loan-disb-rollback') THEN
            RAISE EXCEPTION 'payout was not visible inside the transaction';
          END IF;
          RAISE EXCEPTION 'injected legacy repayment failure';
        END IF;
        RETURN NEW;
      END;
      $$;
    `));
    await db.execute(sql.raw(`
      CREATE TRIGGER fail_legacy_repayment BEFORE INSERT ON contributions
        FOR EACH ROW EXECUTE FUNCTION fail_legacy_repayment();
    `));
    try {
      await assert.rejects(linkExistingLoans(), (error) => {
        assert.match(error.cause?.message ?? error.message, /injected legacy repayment failure/);
        return true;
      });
      assert.deepEqual(await journal(), []);
      assert.deepEqual(await db.select().from(loansTable), [before]);
    } finally {
      await db.execute(sql`DROP TRIGGER fail_legacy_repayment ON contributions`);
      await db.execute(sql`DROP FUNCTION fail_legacy_repayment()`);
    }
    assert.deepEqual(await linkExistingLoans(), summary(1));
    const rows = await journal();
    assert.deepEqual(rows.map((row) => [row.id, row.amount]), [
      ["loan-disb-rollback", 1000], ["loan-repaid-rollback", 450],
    ]);
    assert.deepEqual(await linkExistingLoans(), summary());
    assert.deepEqual(await journal(), rows);
  });
});
