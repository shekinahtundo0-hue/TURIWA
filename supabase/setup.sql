-- Run this in Supabase → SQL Editor so /rest/v1 can serve Turiwa tables.

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
  name text not null,
  members integer not null,
  target integer not null,
  monthly integer not null,
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
  principal integer not null,
  balance integer not null,
  monthly_repayment integer not null,
  interest_rate integer not null,
  due_date text not null,
  purpose text not null,
  status text not null
);

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

drop policy if exists turiwa_circles_all on public.circles;
create policy turiwa_circles_all on public.circles for all using (true) with check (true);

drop policy if exists turiwa_contributions_all on public.contributions;
create policy turiwa_contributions_all on public.contributions for all using (true) with check (true);

drop policy if exists turiwa_loans_all on public.loans;
create policy turiwa_loans_all on public.loans for all using (true) with check (true);

drop policy if exists turiwa_app_meta_all on public.app_meta;
create policy turiwa_app_meta_all on public.app_meta for all using (true) with check (true);

grant select, insert, update, delete on public.circles, public.contributions, public.loans, public.app_meta to anon, authenticated;

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
