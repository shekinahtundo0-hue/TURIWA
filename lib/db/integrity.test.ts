// Run from the repository root with the already-installed runner:
// node scripts/node_modules/tsx/dist/cli.mjs lib/db/integrity.test.ts
// Every database is in memory. No environment loader, initDb, network or disk database.
import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { ensureSchema, seedIfEmpty } from "./src/bootstrap";
import type { AppDb } from "./src/client";
import * as schema from "./src/schema";

type Loan = Record<string, unknown>;
const roster = [
  { id: "primary", role: "admin", status: "active" },
  { id: "co1", role: "co-admin", status: "active" },
  { id: "co2", role: "co-admin" }, // Missing status means active in the API.
  { id: "member", role: "member", status: "active" },
  { id: "ordinary", role: "member", status: "active" },
  { id: "inactive", role: "co-admin", status: "removed" },
  { id: "roster-admin", role: "admin", status: "active" },
];

function appDb(client: PGlite): AppDb {
  return drizzle(client, { schema }) as unknown as AppDb;
}

async function fixtures(client: PGlite) {
  for (const id of [...roster.map((member) => member.id), "outsider"]) {
    await client.query("INSERT INTO users (id, name) VALUES ($1, $1)", [id]);
    await client.query("INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, clock_timestamp() + interval '1 day')", [`session-${id}`, id]);
  }
  await client.exec(`
    INSERT INTO sessions (token, user_id, expires_at) VALUES
      ('expired', 'primary', clock_timestamp() - interval '1 second'),
      ('orphan', 'missing-user', clock_timestamp() + interval '1 day');
  `);
  await client.query(`INSERT INTO circles
    (id, name, members, target, contribution, created_by, color, members_list)
    VALUES ('circle', 'Test circle', 7, 100000, 1000, 'primary', 'green', $1::jsonb)`, [JSON.stringify(roster)]);
  await insertLoan(client, { id: "pending" });
}

async function insertLoan(client: PGlite, overrides: Loan = {}) {
  const loan: Loan = {
    id: "new-loan", user_id: "primary", circle_id: "circle", principal: 1000,
    balance: 1200, monthly_repayment: 200, total_payable: 1200, months: 6,
    requested_principal: 1000, requested_months: 6, interest_rate: 5, interest_period: "Month",
    due_date: "15 Mar 2027", due_on: "2027-03-15", purpose: "Test request", status: "Pending",
    ...overrides,
  };
  const columns = Object.keys(loan);
  return (await client.query<Loan>(`INSERT INTO loans (${columns.join(", ")})
    VALUES (${columns.map((_, index) => `$${index + 1}`).join(", ")}) RETURNING *`, Object.values(loan))).rows[0];
}

async function isolated(client: PGlite, token: string | undefined, run: () => Promise<void>) {
  await client.exec("BEGIN");
  try {
    if (token !== undefined) {
      await client.query("SELECT set_config('turiwa.session_token', $1, true)", [token]);
    }
    await run();
  } finally {
    await client.exec("ROLLBACK");
  }
}

async function denied(run: () => Promise<unknown>, message: RegExp, code = "42501") {
  await assert.rejects(run, (error: unknown) => {
    const sqlError = error as { code: string; message: string };
    assert.equal(sqlError.code, code);
    assert.match(sqlError.message, message);
    return true;
  });
}

async function approve(client: PGlite) {
  return (await client.query<Loan>("UPDATE loans SET status = 'Active' WHERE id = 'pending' RETURNING *")).rows[0];
}

async function updateRoster(client: PGlite, members: unknown) {
  await client.query("UPDATE circles SET members_list = $1::jsonb WHERE id = 'circle'", [JSON.stringify(members)]);
}

const changeRole = (id: string, role: string) => roster.map((member) => member.id === id ? { ...member, role } : member);
const changeStatus = (id: string, status: string) => roster.map((member) => member.id === id ? { ...member, status } : member);

test("fresh schema: session-authenticated loan and circle integrity", async (t) => {
  const client = new PGlite();
  try {
    await ensureSchema(appDb(client));
    await fixtures(client);

    await t.test("shape 2 keeps 17 tables and invoker functions with fixed search paths and no PUBLIC execute", async () => {
      const tables = await client.query<{ count: number }>("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname = 'public'");
      assert.equal(tables.rows[0].count, 17);
      const marker = await client.query<{ value: string }>("SELECT value FROM app_meta WHERE key = 'schema_shape'");
      assert.equal(marker.rows[0].value, "2");
      const functions = await client.query<{ proname: string; prosecdef: boolean; proconfig: string[]; public_execute: boolean }>(`
        SELECT p.proname, p.prosecdef, p.proconfig, EXISTS (
          SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) AS acl
          WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
        ) AS public_execute
        FROM pg_proc AS p JOIN pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN
          ('turiwa_session_actor', 'enforce_loan_integrity', 'enforce_circle_role_authority')
      `);
      assert.equal(functions.rows.length, 3);
      for (const fn of functions.rows) {
        assert.equal(fn.prosecdef, false, fn.proname);
        assert.deepEqual(fn.proconfig, ["search_path=pg_catalog, pg_temp"], fn.proname);
        assert.equal(fn.public_execute, false, fn.proname);
      }
      const triggersBefore = await client.query("SELECT oid, tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname");
      await ensureSchema(appDb(client));
      assert.deepEqual((await client.query("SELECT oid, tgname FROM pg_trigger WHERE NOT tgisinternal ORDER BY tgname")).rows, triggersBefore.rows);
    });

    for (const token of [undefined, "", "invented", "primary", "expired", "orphan"]) {
      for (const operation of ["insert", "update"]) {
        await t.test(`${operation} funding rejects ${String(token)} token`, () => isolated(client, token, async () => {
          await denied(() => operation === "insert" ? insertLoan(client, { status: "Active" }) : approve(client), /valid, unexpired session/);
        }));
      }
    }

    for (const operation of ["insert", "update"]) {
      await t.test(`direct self-approval ${operation} rejects the primary's real token`, () => isolated(client, "session-primary", async () => {
        await denied(() => operation === "insert" ? insertLoan(client, { status: "Active", reviewed_by: "co1" }) : approve(client), /own loan/);
      }));
      await t.test(`spoofed reviewer on ${operation} is rejected`, () => isolated(client, "session-co1", async () => {
        await denied(() => operation === "insert"
          ? insertLoan(client, { status: "Active", reviewed_by: "co2" })
          : client.exec("UPDATE loans SET status = 'Active', reviewed_by = 'co2' WHERE id = 'pending'"), /reviewer does not match/);
      }));
      await t.test(`second manager can ${operation} funding; actor and time come from DB`, () => isolated(client, "session-co1", async () => {
        const before = Date.now();
        const loan = operation === "insert"
          ? await insertLoan(client, { status: "Active", reviewed_by: "co1", reviewed_at: "2000-01-01T00:00:00Z" })
          : (await client.query<Loan>(`UPDATE loans SET status = 'Active', principal = 1100,
              reviewed_at = '2000-01-01T00:00:00Z' WHERE id = 'pending' RETURNING *`)).rows[0];
        assert.equal(loan.reviewed_by, "co1");
        assert.ok(new Date(loan.reviewed_at as string).getTime() >= before);
        assert.ok(new Date(loan.reviewed_at as string).getTime() <= Date.now());
        assert.equal(loan.requested_principal, 1000);
      }));
    }

    await t.test("a co-admin cannot approve their own directly inserted loan", () => isolated(client, "session-co1", async () => {
      await denied(() => insertLoan(client, { status: "Active", user_id: "co1" }), /own loan/);
    }));
    for (const actor of ["member", "outsider", "inactive"]) {
      await t.test(`${actor} is not a current manager`, () => isolated(client, `session-${actor}`, async () => {
        await denied(() => approve(client), /current circle manager/);
      }));
    }
    for (const actor of ["co2", "roster-admin"]) {
      await t.test(`${actor} can approve on the current active roster`, () => isolated(client, `session-${actor}`, async () => {
        assert.equal((await approve(client)).reviewed_by, actor);
      }));
    }
    await t.test("created_by can approve another borrower without a roster entry", () => isolated(client, "session-primary", async () => {
      await updateRoster(client, roster.filter((member) => member.id !== "primary"));
      assert.equal((await insertLoan(client, { status: "Active", user_id: "member" })).reviewed_by, "primary");
    }));
    await t.test("arbitrary actor id settings do not authenticate", () => isolated(client, undefined, async () => {
      await client.exec("SELECT set_config('turiwa.user_id', 'co1', true)");
      await denied(() => approve(client), /valid, unexpired session/);
    }));
    await t.test("temporary tables cannot shadow the session lookup", () => isolated(client, "invented", async () => {
      await client.exec(`CREATE TEMP TABLE sessions (token text, user_id text, expires_at timestamp);
        CREATE TEMP TABLE users (id text);
        INSERT INTO users VALUES ('co1');
        INSERT INTO sessions VALUES ('invented', 'co1', clock_timestamp() + interval '1 day');`);
      await denied(() => approve(client), /valid, unexpired session/);
    }));
    await t.test("transaction-local tokens disappear on commit", async () => {
      await client.exec("BEGIN");
      await client.query("SELECT set_config('turiwa.session_token', 'session-co1', true)");
      await client.exec("COMMIT");
      await isolated(client, undefined, async () => {
        await denied(() => approve(client), /valid, unexpired session/);
      });
    });

    for (const metadata of [{ reviewed_by: "co1" }, { reviewed_at: "2026-01-01T00:00:00Z" }]) {
      await t.test(`Pending insert forbids ${Object.keys(metadata)[0]}`, () => isolated(client, "session-co1", async () => {
        await denied(() => insertLoan(client, metadata), /Pending loans cannot claim/, "23514");
      }));
    }
    await t.test("Pending update forbids approval metadata", () => isolated(client, "session-co1", async () => {
      await denied(() => client.exec("UPDATE loans SET reviewed_by = 'co1' WHERE id = 'pending'"), /Pending loans cannot claim/, "23514");
    }));
    for (const amounts of [
      { principal: 0 }, { principal: -1 }, { monthly_repayment: 0 }, { total_payable: 999 },
      { balance: -1 }, { balance: 1201 }, { months: 0 }, { requested_principal: -1 },
      { requested_months: 0 }, { interest_rate: -1 }, { interest_period: "invalid" },
    ]) {
      await t.test(`new loan rejects invalid ${JSON.stringify(amounts)}`, () => isolated(client, undefined, async () => {
        await denied(() => insertLoan(client, amounts), /Invalid loan amounts/, "23514");
      }));
    }
    await t.test("approval revalidates the funded terms", () => isolated(client, "session-co1", async () => {
      await denied(() => client.exec("UPDATE loans SET status = 'Active', total_payable = 1 WHERE id = 'pending'"), /Invalid loan amounts/, "23514");
    }));
    await t.test("zero-interest loans and old requested-principal defaults remain usable", () => isolated(client, undefined, async () => {
      const loan = await insertLoan(client, { interest_rate: 0, requested_principal: 0 });
      assert.equal(loan.requested_principal, 1000);
    }));
    for (const loan of [{ user_id: null }, { circle_id: null }, { circle_id: "missing" }]) {
      await t.test(`funding rejects missing identity ${JSON.stringify(loan)}`, () => isolated(client, "session-co1", async () => {
        await denied(() => insertLoan(client, { ...loan, status: "Active" }), /borrower and circle|circle does not exist/, "23514");
      }));
    }
    await t.test("paid-off inserts cannot evade authenticated funding", () => isolated(client, undefined, async () => {
      await denied(() => insertLoan(client, { status: "Paid off", balance: 0 }), /valid, unexpired session/);
    }));
    await t.test("Pending cannot skip approval by becoming paid off", () => isolated(client, "session-co1", async () => {
      await denied(() => client.exec("UPDATE loans SET status = 'Paid off', balance = 0 WHERE id = 'pending'"), /Invalid loan status transition/, "23514");
    }));
    await t.test("rejection still works, but cannot be used as a funding detour", () => isolated(client, undefined, async () => {
      await client.exec("UPDATE loans SET status = 'Rejected', reviewed_by = 'co1', reviewed_at = now() WHERE id = 'pending'");
      await denied(() => client.exec("UPDATE loans SET status = 'Active' WHERE id = 'pending'"), /Invalid loan status transition/, "23514");
    }));

    for (const [column, value] of Object.entries({
      user_id: "member", circle_id: "other", reviewed_by: "co2", reviewed_at: null,
      principal: 1100, total_payable: 1300, monthly_repayment: 250, months: 12,
      interest_rate: 10, interest_period: "Year", due_date: "later", due_on: "2028-01-01",
      requested_principal: 999, requested_months: 9, submitted_at: "2000-01-01T00:00:00Z",
    })) {
      await t.test(`funded ${column} is immutable even with an authorized token`, () => isolated(client, "session-co1", async () => {
        await approve(client);
        await denied(() => client.query(`UPDATE loans SET ${column} = $1 WHERE id = 'pending'`, [value]), /immutable/, "23514");
      }));
    }
    await t.test("funded loans cannot go back to Pending", () => isolated(client, "session-co1", async () => {
      await approve(client);
      await denied(() => client.exec("UPDATE loans SET status = 'Pending', reviewed_by = NULL, reviewed_at = NULL WHERE id = 'pending'"), /Invalid loan status transition/, "23514");
    }));
    for (const balance of [-1, 1300]) {
      await t.test(`repayment rejects balance ${balance}`, () => isolated(client, "session-co1", async () => {
        await approve(client);
        await denied(() => client.query("UPDATE loans SET balance = $1 WHERE id = 'pending'", [balance]), /Repayments must reduce/, "23514");
      }));
    }
    await t.test("newly funded loan repays fully without an approval token", () => isolated(client, "session-co1", async () => {
      const approved = await approve(client);
      await client.query("SELECT set_config('turiwa.session_token', '', true)");
      await client.exec("UPDATE loans SET balance = 700 WHERE id = 'pending'");
      const paid = (await client.query<Loan>("UPDATE loans SET balance = 0, status = 'Paid off' WHERE id = 'pending' RETURNING *")).rows[0];
      assert.equal(paid.balance, 0);
      assert.equal(paid.reviewed_by, approved.reviewed_by);
      assert.deepEqual(paid.reviewed_at, approved.reviewed_at);
    }));

    for (const token of [undefined, "expired", "orphan", "session-member", "session-co1", "session-outsider"]) {
      await t.test(`role changes reject ${String(token)}`, () => isolated(client, token, async () => {
        await denied(() => updateRoster(client, changeRole("co2", "member")), /valid, unexpired session|current primary admin/);
      }));
      await t.test(`ownership transfer rejects ${String(token)}`, () => isolated(client, token, async () => {
        await denied(() => client.exec("UPDATE circles SET created_by = 'co1' WHERE id = 'circle'"), /valid, unexpired session|current primary admin/);
      }));
    }
    await t.test("only primary can demote and promote", () => isolated(client, "session-primary", async () => {
      await updateRoster(client, changeRole("co2", "member"));
      await updateRoster(client, [...changeRole("co2", "member")].map((member) => member.id === "ordinary" ? { ...member, role: "co-admin" } : member));
    }));
    await t.test("primary cannot create a third active co-admin", () => isolated(client, "session-primary", async () => {
      await denied(() => updateRoster(client, changeRole("ordinary", "co-admin")), /at most two Co-Admins/, "23514");
    }));
    await t.test("third active co-admin is also rejected on circle INSERT", () => isolated(client, "session-primary", async () => {
      await denied(() => client.query(`INSERT INTO circles (id, name, members, target, contribution, color, members_list)
        VALUES ('third', 'Third', 3, 1, 1, 'green', $1::jsonb)`, [JSON.stringify(changeRole("ordinary", "co-admin"))]), /at most two Co-Admins/, "23514");
    }));
    for (const id of ["primary", "co1", "roster-admin"]) {
      for (const removal of ["status", "delete"]) {
        await t.test(`non-primary cannot remove ${id} by ${removal}`, () => isolated(client, "session-co2", async () => {
          await denied(() => updateRoster(client, removal === "status" ? changeStatus(id, "removed") : roster.filter((member) => member.id !== id)), /current primary admin/);
        }));
        await t.test(`primary can remove ${id} by ${removal}`, () => isolated(client, "session-primary", async () => {
          await updateRoster(client, removal === "status" ? changeStatus(id, "removed") : roster.filter((member) => member.id !== id));
        }));
      }
    }
    await t.test("reactivating a co-admin requires primary authority", () => isolated(client, "session-co1", async () => {
      // Free one slot as primary, then prove a co-admin cannot reactivate a former manager.
      await client.query("SELECT set_config('turiwa.session_token', 'session-primary', true)");
      await updateRoster(client, changeRole("co2", "member"));
      await client.query("SELECT set_config('turiwa.session_token', 'session-co1', true)");
      await denied(() => updateRoster(client, changeRole("co2", "member").map((member) => member.id === "inactive" ? { ...member, status: "active" } : member)), /current primary admin/);
    }));
    await t.test("ordinary joins, status removal, deletion, names and roster reordering need no token", () => isolated(client, undefined, async () => {
      await updateRoster(client, [...roster, { id: "new-member", role: "member", status: "active" }]);
      await updateRoster(client, changeStatus("member", "removed"));
      await updateRoster(client, roster.filter((member) => member.id !== "ordinary"));
      await updateRoster(client, roster.map((member) => ({ ...member, name: "Display name" })).reverse());
      await client.exec("UPDATE circles SET name = 'Renamed', members = 8 WHERE id = 'circle'");
    }));
    await t.test("clearing the roster cannot silently remove managers", () => isolated(client, undefined, async () => {
      await denied(() => client.exec("UPDATE circles SET members_list = NULL WHERE id = 'circle'"), /valid, unexpired session/);
    }));
    for (const invalid of [{}, [...roster, roster[3]], [...roster, { role: "member" }]]) {
      await t.test("ambiguous roster is rejected", () => isolated(client, "session-primary", async () => {
        await denied(() => updateRoster(client, invalid), /roster must be an array|unique, nonempty ids/, "23514");
      }));
    }
    await t.test("transfer uses OLD owner, then only the new owner may change roles", () => isolated(client, "session-primary", async () => {
      const transferred = roster.map((member) => member.id === "primary" ? { ...member, role: "member" }
        : member.id === "co1" ? { ...member, role: "admin" } : member);
      await client.query("UPDATE circles SET created_by = 'co1', members_list = $1::jsonb WHERE id = 'circle'", [JSON.stringify(transferred)]);
      await client.query("SELECT set_config('turiwa.session_token', 'session-co1', true)");
      await updateRoster(client, transferred.map((member) => member.id === "co2" ? { ...member, role: "member" } : member));
      await client.query("SELECT set_config('turiwa.session_token', 'session-primary', true)");
      await denied(() => updateRoster(client, transferred), /current primary admin/);
    }));
    await t.test("approval checks the roster after a manager is demoted", () => isolated(client, "session-primary", async () => {
      await updateRoster(client, changeRole("co1", "member"));
      await client.query("SELECT set_config('turiwa.session_token', 'session-co1', true)");
      await denied(() => approve(client), /current circle manager/);
    }));
  } finally {
    await client.close();
  }
});

test("shape 1 upgrade preserves legacy self-approval and permits repayments", async () => {
  const client = new PGlite();
  try {
    const db = appDb(client);
    await ensureSchema(db);
    await fixtures(client);
    // Only this disposable, in-memory fixture removes the new guards to represent shape 1.
    // No bypass setting exists in the implementation or in normal application operations.
    await client.exec(`DROP TRIGGER loans_integrity ON loans;
      DROP TRIGGER circles_role_authority ON circles;
      UPDATE app_meta SET value = '1' WHERE key = 'schema_shape';`);
    await insertLoan(client, { id: "legacy-self", status: "Active", reviewed_by: "primary", reviewed_at: "2020-01-01T00:00:00Z", balance: 800 });
    await insertLoan(client, { id: "legacy-invalid", status: "Active", reviewed_by: "primary", reviewed_at: "2020-01-01T00:00:00Z", monthly_repayment: 0, balance: 1600 });
    await insertLoan(client, { id: "legacy-null", status: "Active", user_id: null, circle_id: null });
    const before = (await client.query<Loan>("SELECT * FROM loans WHERE id LIKE 'legacy-%' ORDER BY id")).rows;
    await ensureSchema(db);
    assert.deepEqual((await client.query("SELECT * FROM loans WHERE id LIKE 'legacy-%' ORDER BY id")).rows, before);
    await ensureSchema(db);
    await client.exec("UPDATE loans SET balance = balance - 100 WHERE id LIKE 'legacy-%'");
    const after = (await client.query<Loan>("SELECT * FROM loans WHERE id LIKE 'legacy-%' ORDER BY id")).rows;
    for (let i = 0; i < before.length; i++) {
      assert.deepEqual(after[i], { ...before[i], balance: Number(before[i].balance) - 100 });
    }
    await client.exec("UPDATE loans SET balance = 0, status = 'Paid off' WHERE id LIKE 'legacy-%'");
    for (const assignment of ["reviewed_by = 'co1'", "reviewed_at = now()", "principal = 999", "user_id = 'member'", "circle_id = NULL"]) {
      await isolated(client, undefined, async () => {
        await denied(() => client.exec(`UPDATE loans SET ${assignment} WHERE id = 'legacy-self'`), /immutable/, "23514");
      });
    }
    await isolated(client, undefined, async () => {
      await denied(() => approve(client), /valid, unexpired session/);
    });
    await isolated(client, undefined, async () => {
      await denied(() => updateRoster(client, changeRole("co1", "member")), /valid, unexpired session/);
    });
  } finally {
    await client.close();
  }
});

test("empty demo bootstrap creates requests, not self-approved funding", async () => {
  const client = new PGlite();
  try {
    const db = appDb(client);
    await ensureSchema(db);
    await seedIfEmpty(db, () => "test-only-password-hash");
    await seedIfEmpty(db, () => "test-only-password-hash");
    const loans = (await client.query<Loan>("SELECT * FROM loans")).rows;
    assert.equal(loans.length, 2);
    for (const loan of loans) {
      assert.equal(loan.status, "Pending");
      assert.equal(loan.reviewed_by, null);
      assert.equal(loan.reviewed_at, null);
    }
  } finally {
    await client.close();
  }
});
