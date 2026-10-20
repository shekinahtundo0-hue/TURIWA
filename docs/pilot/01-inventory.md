# Day 1 — Backup and inventory

Date: 2026-10-14. Everything below was read or run against the working copy at
`C:\Users\Admin\Downloads\Turiwa-Mobile\Turiwa-Mobile`, not written from memory.

## 1. Backup: taken, verified, and restored once

`scripts/backup-db.mjs` is now part of the repository.

| Command | What it does |
| --- | --- |
| `node scripts/backup-db.mjs` | Copies the local database into `backups/<timestamp>/turiwa`, writes `SHA256SUMS.txt` and `manifest.json` |
| `node scripts/backup-db.mjs --verify backups/<dir>` | Re-hashes every file in a snapshot and fails on any mismatch |
| `node scripts/backup-db.mjs --restore backups/<dir>` | Verifies first, moves the live directory aside (never deletes it), copies the snapshot back |

Run today, all four steps proved:

```text
Backed up 1012 files, 27.1 MB          -> backups/2026-10-14T16-54-14-653Z
1012/1012 files match the snapshot.    -> --verify
Kept what was there at ...-replaced-... -> --restore, then the API served
circles 2 | contributions 5 | loans 2   -> the restored database, through the API
```

The script refuses to copy while the API answers on `PORT` (checked, exit code 1). A
snapshot taken mid-write can open as a database that disagrees with itself, and for a
ledger that is the one failure mode worth designing around.

**Two things this backup is not yet:**
- It is a *file* snapshot, not a logical dump. Fine for PGlite on one machine; a hosted
  Postgres needs `pg_dump` or the provider's own PITR.
- Nothing schedules it. A backup that only exists when someone remembers to run it is a
  plan for one bad morning.

## 2. A real risk found and closed

`artifacts/api-server/data/` held **1012 untracked but not-ignored files** — the whole
running database, including password hashes, live session tokens and members' phone
numbers. One `git add -A` before a first push would have committed all of it into
permanently retrievable history.

`.gitignore` now covers `/artifacts/api-server/data/` and `/backups/`. Verified:
`git status --porcelain -uall artifacts/api-server/data` went from 1012 lines to 0.

## 3. Database inventory

Seven tables, created and upgraded by `lib/db/src/bootstrap.ts`. There is no migration
history — the schema is `CREATE TABLE IF NOT EXISTS` plus `ALTER TABLE ... ADD COLUMN IF
NOT EXISTS`, so the *only* definition of what a deployed database looks like is whatever
the code has accumulated.

| Table | Columns | Holds personal or financial data |
| --- | --- | --- |
| `users` | id, name, phone, email, google_id, password_hash, two_factor_secret, two_factor_enabled_at, backup_codes, created_at | Both |
| `circles` | id, name, members, members_list (jsonb), target, contribution, frequency, joining_fee, welfare, loan_interest_percent, loan_interest_period, created_by, color | Group + member names/phones |
| `contributions` | id, circle_id, user_id, amount, date, note, status, type, member, created_at | Financial ledger |
| `loans` | id, user_id, circle_id, principal, balance, monthly_repayment, total_payable, months, interest_rate, interest_period, due_date, purpose, status | Financial, and `purpose` is free text about a person |
| `sessions` | token, user_id, created_at, expires_at | Bearer credentials, 30-day life |
| `auth_codes` | id, phone, purpose, code, attempts, verified_at, created_at, expires_at | A live second factor |
| `app_meta` | key, value | Only the state version counter |

Structural facts worth stating plainly:

- **No foreign keys.** `circle_id`, `user_id` and `created_by` are plain `text`. Nothing
  stops a row pointing at a group or a member that no longer exists.
- **No drizzle-declared indexes.** Two exist as raw SQL in bootstrap
  (`loans_user_id_idx`, `contributions_circle_id_idx`). `circles.created_by`, the column
  every single read is filtered by, has none.
- **No transactions.** Every write is one statement, so nothing is atomic across two.
- **No audit table.** Nothing records who changed what, or when a figure was corrected.
- **No money type.** Amounts are `integer` KES, which avoids float error but has no
  currency column — the ledger silently assumes KES everywhere.

## 4. Application inventory

**Screens** (expo-router; route groups drop out of the URL):
`/welcome`, `/sign-in`, `/sign-up`, `/forgot-password`, `/create-group`,
`/` Home, `/circles`, `/activity`, `/loans`, `/profile`.

**API routes**, with the auth gate each one actually carries:

| Public | Authenticated |
| --- | --- |
| `GET /healthz` | `GET /state`, `GET /events` (SSE) |
| `POST /auth/sign-in`, `/sign-up`, `/google`, `/sign-out`* | `GET /auth/me`, `PATCH /auth/profile` |
| `POST /auth/otp`, `/auth/otp/verify` | `POST /auth/password/change` |
| `POST /auth/password/reset`, `/reset-code` | `POST /auth/2fa/enroll`, `/activate`, `/disable` |
| | `POST /circles`, `/contributions`, `/loans` |
| | `POST /loans/:id/approve`, `/loans/:id/repay` |
| | `DELETE /auth/account` |

\* `/sign-out` is gated but fails safe.

**Storage driver today:** `DATABASE_URL` resolves to `pglite://data/turiwa` — an
embedded Postgres in the API process's own folder. The Supabase pooler variables exist in
`.env` but are not in use, so the app has no durable hosted database and no way to scale
past one process.

## 5. Environment inventory (names only, values never copied here)

`.env` (root, git-ignored): `PORT`, `EXPO_PUBLIC_API_URL`, `DATABASE_URL`, `DATABASE_SSL`,
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `EXPO_PUBLIC_SUPABASE_URL`,
`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_DB_HOST`, `SUPABASE_DB_PORT`,
`SUPABASE_DB_NAME`, `SUPABASE_DB_USER`, `SUPABASE_DB_PASSWORD`, `FIREBASE_API_KEY`,
`FIREBASE_PROJECT_ID`, `GOOGLE_CLIENT_ID`, `SHOW_SMS_CODES`.

`artifacts/turiwa-mobile/.env.local` (git-ignored): the `EXPO_PUBLIC_*` Firebase/Google
web config plus `EXPO_PUBLIC_API_URL`.

Three observations:

1. `SHOW_SMS_CODES=true` is set locally. It is the only reason phone sign-up works at all
   on this machine, and `codesVisibleToCaller()` also demands `NODE_ENV !== "production"`
   — a correct double lock, but one worth an automated check rather than trust.
2. The `NEXT_PUBLIC_*` pair is dead weight: nothing in this repo is a Next.js app.
3. Every `EXPO_PUBLIC_*` value ships to the browser by definition. The Firebase web API key
   and Google client ID belong there; if a service-role or secret key is ever added, it
   must not use that prefix. No secret-bearing variable is exposed today.

## 6. What Day 1 leaves open

- Backups are manual and local-only. A pilot with real groups needs an off-machine copy.
- The restore test proved the *files* come back; it did not prove the app behaves after a
  restore on a hosted database, because there isn't one yet.
- Schema changes have no migration history to review before they hit production.
