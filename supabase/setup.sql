-- Supabase-side schema bootstrap. The tables themselves are created and migrated by the API
-- (lib/db, drizzle), so this file exists to state one thing the dashboard cannot: nothing on
-- /rest/v1 may reach members' money. The app never talks to PostgREST — the Express API
-- connects as the table owner, which bypasses row level security by ownership, so every policy
-- an anon or authenticated key could match has to stay revoked.

create table if not exists public.users (
  id text primary key,
  name text not null,
  phone text unique,
  email text unique,
  google_id text unique,
  password_hash text,
  created_at timestamptz not null default now()
);

create table if not exists public.circles (
  id text primary key,
  join_code text unique,
  name text not null,
  members integer not null,
  target integer not null,
  monthly integer not null,
  late_fine integer not null default 0,
  color text not null
);

create table if not exists public.contributions (
  id text primary key,
  circle_id text not null,
  amount integer not null,
  date text not null,
  note text not null,
  status text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.loans (
  id text primary key,
  user_id text,
  circle_id text,
  principal integer not null,
  requested_principal integer not null default 0,
  balance integer not null,
  monthly_repayment integer not null,
  total_payable integer not null default 0,
  months integer not null default 6,
  requested_months integer not null default 6,
  interest_rate integer not null,
  interest_period text not null default 'Month',
  due_date text not null,
  due_on text,
  purpose text not null,
  status text not null,
  submitted_at timestamptz not null default now(),
  reviewed_by text,
  reviewed_at timestamptz,
  rejection_reason text
);

-- Additive upgrades keep existing loan records while enabling review history.
alter table public.loans add column if not exists user_id text;
alter table public.loans add column if not exists circle_id text;
alter table public.loans add column if not exists requested_principal integer not null default 0;
alter table public.loans add column if not exists total_payable integer not null default 0;
alter table public.loans add column if not exists months integer not null default 6;
alter table public.loans add column if not exists requested_months integer not null default 6;
alter table public.loans add column if not exists interest_period text not null default 'Month';
alter table public.loans add column if not exists due_on text;
alter table public.loans add column if not exists submitted_at timestamptz not null default now();
alter table public.loans add column if not exists reviewed_by text;
alter table public.loans add column if not exists reviewed_at timestamptz;
alter table public.loans add column if not exists rejection_reason text;
update public.loans set requested_principal = principal where requested_principal = 0;
update public.loans set total_payable = greatest(monthly_repayment * months, principal) where total_payable = 0;

create table if not exists public.app_meta (
  key text primary key,
  value text not null
);

create table if not exists public.sessions (
  token text primary key,
  user_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.auth_codes (
  id text primary key,
  phone text not null,
  purpose text not null,
  code text not null,
  expires_at timestamptz not null
);

alter table public.circles enable row level security;
alter table public.contributions enable row level security;
alter table public.loans enable row level security;
alter table public.app_meta enable row level security;

-- Revoked rather than absent: with RLS on and no permissive policy, every non-owner role is
-- denied, and re-running this file cannot leave an open policy behind.
drop policy if exists turiwa_circles_all on public.circles;
drop policy if exists turiwa_contributions_all on public.contributions;
drop policy if exists turiwa_loans_all on public.loans;
drop policy if exists turiwa_app_meta_all on public.app_meta;

revoke all on public.circles, public.contributions, public.loans, public.app_meta from anon;
revoke all on public.circles, public.contributions, public.loans, public.app_meta from authenticated;
revoke all on public.users, public.sessions, public.auth_codes from anon;
revoke all on public.users, public.sessions, public.auth_codes from authenticated;

insert into public.circles (id, name, members, target, monthly, color)
values
  ('harambee', 'Harambee Queens', 12, 240000, 2000, 'green'),
  ('estate', 'Greenview Estate', 8, 160000, 1500, 'gold')
on conflict (id) do nothing;

insert into public.contributions (id, circle_id, amount, date, note, status)
values
  ('1', 'harambee', 2000, 'Today, 08:42', 'Monthly contribution', 'Complete'),
  ('2', 'estate', 1500, '28 Aug 2026', 'Monthly contribution', 'Complete'),
  ('3', 'harambee', 2000, '28 Jul 2026', 'Monthly contribution', 'Complete')
on conflict (id) do nothing;

insert into public.loans (id, principal, balance, monthly_repayment, interest_rate, due_date, purpose, status)
values
  ('loan-1', 30000, 16800, 4000, 5, '30 Sep 2026', 'School fees', 'Active')
on conflict (id) do nothing;

insert into public.app_meta (key, value) values ('version', '1')
on conflict (key) do nothing;

alter publication supabase_realtime add table public.circles;
alter publication supabase_realtime add table public.contributions;
alter publication supabase_realtime add table public.loans;
alter publication supabase_realtime add table public.app_meta;
