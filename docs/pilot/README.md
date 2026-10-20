# Pilot programme — the seven days

Working documents from the 30-day validation plan's first week, dated 2026-10-14. Each one
records what was run or read against this repository, with the file and line that proves it,
so the next person does not have to re-derive it. Read them in order; §7 is the one that
decides whether any of it continues.

| Day | Document | What it settles |
| --- | --- | --- |
| 1 | [`01-inventory.md`](01-inventory.md) | Backup taken, verified and restored once; the app's tables, screens, routes and env vars; the live database was one `git add -A` away from being committed |
| 2 | [`02-security-audit.md`](02-security-audit.md) | There is no RLS because there is no server Postgres — isolation is app-layer; what "admin" can and cannot do; every financial write; two fixes proved (query-string tokens, password guessing) |
| 3 | [`03-workflow-test.md`](03-workflow-test.md) | A full contribution → expense → loan → repayment → report cycle on a throwaway database, 40 checks; the discrepancy it exposes is that lending never reaches the ledger |
| 4 | [`04-interview-kit.md`](04-interview-kit.md) | The instrument for three chama officials: who to book, 18 questions, hypotheses to listen for, a results sheet, and the discipline that keeps it from becoming a sales call |
| 5 | [`05-priorities.md`](05-priorities.md) | Three improvements scored from Days 1–3 evidence — loans in the ledger, a closable month, groups that belong to their members — plus what was deliberately left out and why; tasks #68 #69 #70 |
| 6 | [`06-demo-and-onboarding.md`](06-demo-and-onboarding.md) | A synthetic demo group in its own database on its own port, the twelve-minute walk-through, seven limits to admit before a customer finds them, and the one-page guide a group gets after the call |
| 7 | [`07-pilot-schedule.md`](07-pilot-schedule.md) | Dated schedule through 23 Nov, per-group tracker, the metrics that decide the pilot, an objection bank with truthful answers, and a three-way go/no-go rule |
| + | [`08-ui-test-pass.md`](08-ui-test-pass.md) | The same flows driven in a real browser against the synthetic demo group: 76 checks green, five accessibility and copy fixes, and the proof that a requested loan is never pending |

## Standing facts across all seven

- **A displayed balance is not proof money exists.** Today the build can express *expected*
  and *member-reported*; *provider-confirmed*, *allocated* and *disputed* have no columns.
- **One account records one group.** Members are rows in a JSON column with no login, so a
  pilot is a shared window, not a shared workspace.
- **Nothing reconciles to a provider.** No reference field, no confirmation status, no
  M-Pesa. The Reconciliation Engine is a design task, not a screen.
- **Two things block real sign-ups:** an SMS sender, and moving off the embedded database to
  one with roles and policies.
- **Before every demo session:** `node scripts/backup-db.mjs`, with the API stopped.
