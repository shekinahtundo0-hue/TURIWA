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

  // Without USAGE on the schema, PostgREST cannot see any table in it, including ones created
  // after this run — so this is the durable half of the closure and the per-table revokes below
  // are the belt.
  statements.push(
    ...revokeTargets.map((target) => `revoke all on schema public from ${target}`),
  );

  for (const table of tables) {
    statements.push(
      ...revokeTargets.map((target) => `revoke all on table public.${quote(table)} from ${target}`),
      `alter table public.${quote(table)} enable row level security`,
    );
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
