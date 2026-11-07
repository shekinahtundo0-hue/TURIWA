-- Supabase-side access lockdown.
--
-- The tables themselves are created and migrated by the API (lib/db/src/bootstrap.ts, run on
-- every boot), so this file deliberately does not declare them: a second copy of the schema here
-- went stale the moment a column was added, and reading it as the truth would have described a
-- database the app does not use.
--
-- What this file states is the one thing the dashboard cannot: nothing on /rest/v1 may reach a
-- member's money. The app never talks to PostgREST — the Express API connects as the table owner,
-- which bypasses row level security by ownership — so every privilege an anon or authenticated
-- key could match has to stay revoked, on every table, rather than on a list someone maintains.
--
-- Safe to re-run. It creates no tables, changes no rows, and grants nothing.

do $$
declare
  -- Every table the app owns. Keep this in step with lib/db/src/schema/index.ts; the query below
  -- only touches names that actually exist, so a table added here before it is created is skipped
  -- rather than failing the run.
  owned text[] := array[
    'users', 'circles', 'contributions', 'loans', 'app_meta', 'sessions', 'auth_codes',
    'notifications', 'notification_preferences',
    'savings_goals', 'savings_goal_entries', 'circle_meetings', 'meeting_attendance',
    'meeting_action_items', 'circle_proposals', 'proposal_options', 'proposal_votes'
  ];
  t text;
begin
  foreach t in array owned loop
    if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
               where n.nspname = 'public' and c.relname = t and c.relkind = 'r') then
      execute format('alter table public.%I enable row level security', t);
      -- Deliberately not FORCEd: the API connects as the table owner, and an owner only obeys row
      -- level security when it is forced. With RLS enabled and no permissive policy, every non-owner
      -- role — anon, authenticated, anyone else holding a bundle key — is denied, while the API's
      -- own reads and writes still work. Forcing it would lock the app out of its own tables.
      -- Mirrors lib/db/src/harden.ts, which runs the same statements on every boot.
      execute format('revoke all on table public.%I from anon', t);
      execute format('revoke all on table public.%I from authenticated', t);
      execute format('revoke all on table public.%I from public', t);
      -- Realtime streams row changes to whoever holds the same key the app bundle ships, which is
      -- the door this file exists to shut.
      if exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
        execute format('alter publication supabase_realtime drop table public.%I', t);
      end if;
    end if;
  end loop;
end
$$;

-- Without USAGE on the schema, PostgREST cannot see any table in it, including ones created after
-- this run. This is the durable half of the closure; the per-table revokes above are the belt.
revoke all on schema public from anon;
revoke all on schema public from authenticated;
revoke all on schema public from public;
