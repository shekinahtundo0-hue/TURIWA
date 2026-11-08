import type pg from "pg";

// Supabase's Postgres sits behind PostgREST, which answers to a key that ships inside the app
// bundle. Whatever Supabase's default privileges do to a table this API creates, that key must
// not end up able to read members' money, so the schema is closed on every boot rather than
// trusting a dashboard step someone has to remember.
//
// The API itself connects as the table owner, and an owner is not subject to row level security
// unless it is FORCEd, so closing the door for the anon roles costs the API nothing.
const KEYHOLDER_ROLES = ["anon", "authenticated"];

const quote = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`;

/**
 * Does this access control list still hand a privilege to somebody holding the app's public key?
 *
 * An entry prints as `grantee=privileges/grantor`, and the grantee is blank for PUBLIC — the
 * pseudo-role every role in the database holds. An entry with no privileges after the `=` is
 * what a revoke leaves behind, so it is not an opening.
 *
 * A missing list means the object runs on the server's default privileges, and on Supabase those
 * are exactly what this file exists to distrust. Unknown is treated as open.
 */
function stillExposed(acl: string | null, keyholders: readonly string[]): boolean {
  if (acl === null) return true;
  return acl
    .replace(/^\{/, "")
    .replace(/\}$/, "")
    .split(",")
    .some((entry) => {
      const [grantee, granted = ""] = entry.split("=");
      const privileges = granted.split("/")[0];
      if (!privileges) return false;
      return grantee === "" || keyholders.includes(grantee);
    });
}

export async function hardenHostedSchema(
  pool: pg.Pool,
  tables: readonly string[],
): Promise<string[]> {
  const { rows } = await pool.query(
    "select rolname from pg_roles where rolname = any($1)",
    [KEYHOLDER_ROLES],
  );
  const presentRoles = rows.map((row) => row.rolname as string);
  // PUBLIC is a keyword for the pseudo-role every member holds, not a name — quoting it turns it
  // into a lookup for a role called "PUBLIC", which does not exist.
  const revokeTargets = ["PUBLIC", ...presentRoles.map(quote)];

  const statements: string[] = [];

  // Closing the schema is worth more than closing a table, because it also covers tables created
  // after this run — so it is checked first, and the per-table revokes below are the belt.
  const { rows: namespaces } = await pool.query(
    "select array_to_string(nspacl, ',') as acl from pg_namespace where nspname = 'public'",
  );
  if (stillExposed(namespaces[0]?.acl ?? null, presentRoles)) {
    statements.push(
      ...revokeTargets.map((target) => `revoke all on schema public from ${target}`),
    );
  }

  // What the catalogue already says is closed does not need to be revoked again. Before this, a
  // boot sent a revoke per table per role plus an RLS statement per table, all of them no-ops on
  // a database that was closed months ago, and it sent them inside the first request a cold
  // isolate served.
  const { rows: objects } = await pool.query(
    `select c.relname as table, array_to_string(c.relacl, ',') as acl, c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p') and c.relname = any($1)`,
    [tables],
  );
  const present = new Map(objects.map((row) => [row.table as string, row]));
  for (const table of tables) {
    const row = present.get(table);
    // A table the bootstrap has not created yet has no privileges to take back, and revoking from
    // it would fail the whole run.
    if (!row) continue;
    if (stillExposed(row.acl ?? null, presentRoles)) {
      statements.push(`revoke all on table public.${quote(table)} from ${revokeTargets.join(", ")}`);
    }
    if (row.rls !== true) {
      statements.push(`alter table public.${quote(table)} enable row level security`);
    }
  }

  // Realtime streams row changes to whoever holds the same bundle key, which is the same door
  // this file exists to shut. Only touched if the publication exists at all.
  const { rows: published } = await pool.query(
    `select t.tablename from pg_publication p
       join pg_publication_tables t on t.pubname = p.pubname
      where p.pubname = 'supabase_realtime' and t.schemaname = 'public' and t.tablename = any($1)`,
    [tables],
  );
  if (published.length > 0) {
    statements.push(
      `alter publication supabase_realtime drop table ${published
        .map((row) => `public.${quote(row.tablename)}`)
        .join(", ")}`,
    );
  }

  // Nothing is exposed, so nothing changes and the boot pays four reads instead of forty
  // statements. The check is the catalogue itself rather than a note of what was done, so a
  // privilege handed out from the Supabase dashboard is closed again by the next boot.
  if (statements.length === 0) return [];

  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const statement of statements) await client.query(statement);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  return presentRoles;
}
