# Day 2 — Security and financial-integrity audit

Date: 2026-10-14. Audited the code that is actually running (`artifacts/api-server`,
`lib/db`), not the plan. Every line reference was opened today; the two fixes at the end
were proved against the live server.

The checklist item said "audit RLS policies". The honest answer has to come first:

> **There are no RLS policies, because there is nothing for them to apply to.**
> `DATABASE_URL=pglite://data/turiwa` — the app runs on PGlite, an embedded single-user
> Postgres with no other roles to grant to. A repo-wide search for `pgPolicy`,
> `CREATE POLICY` and `ROW LEVEL SECURITY` returns **zero matches**, and there is not one
> `.sql` file in the repository: all seven tables are created imperatively in
> `lib/db/src/bootstrap.ts`.
>
> Isolation is enforced in application code, by one query builder per route. It works
> today. It is also one forgotten `.where()` away from leaking a chama's ledger, and no
> database will notice.

This is the central gap between the strategy document's "non-negotiable technical
safeguards" and the current build. It is fixable only by moving to a real Postgres
(task #28), at which point the policies get written — writing them against PGlite would be
theatre.

## 1. Group isolation — what enforces it today

| Boundary | Enforced at | How |
| --- | --- | --- |
| Which groups an account can read | `store.ts:152` | `where(eq(circlesTable.createdBy, userId))` |
| Which ledger rows it can read | `store.ts:163` | `inArray(contributionsTable.circleId, <own circle ids>)` — empty list returns no rows |
| Which loans it can read | `store.ts:165` | `where(eq(loansTable.userId, userId))` |
| Who may pay into a group | `turiwa.ts:81` | `ownedCircle()` = id **and** `createdBy = me`, else `403` |
| Who may borrow through a group | `turiwa.ts:187` | same check, else `403` |
| Who may repay a loan | `turiwa.ts:231` | owner is part of the `SELECT`; someone else's id reads as `404` |
| Who may approve a loan | `turiwa.ts:259` | owner is part of the `SELECT` (see §2 — this is the problem) |
| Live stream audience | `realtime.ts` + `turiwa.ts:29` | subscribers are keyed by `userId`; a push only reaches that user's sockets |

Verified previously and re-confirmed by the shape of the code: a brand-new account signs
in to an empty app (task #26), and `GET /api/state` without a token is `401` on every
route.

**What is missing:** there is no *foreign key* anywhere in the schema (`circles.created_by`,
`contributions.circle_id`, `loans.user_id` are all plain `text`), so nothing at the database
level stops a row pointing at a group that does not exist or belongs to someone else. The
routes check; the storage does not.

## 2. Administrator permissions

The strategy doc assumes a group has members who are each a person with an account, and an
admin who acts on *their* requests. The build is not that yet:

- A circle's roster is a **JSON column on the group row** (`circles.members_list`), not a
  table of users. `CircleMemberRow` (`schema/circles.ts:11`) has `id`, `name`, `phone`,
  `role`, `status`, `joinedDate` — but no membership is ever checked before a decision.
- `role` is **never read for authorization**. Grepping the server for `membersList` and
  `role` returns only the places that *produce* the payload for the UI
  (`store.ts:126`, `store.ts:140`, `turiwa.ts:147`). No `if (member.role === "admin")`
  exists in any route.
- `role: "co-admin"` is declared in the type and **cannot be created**: the only two writes
  of a role both write `"admin"`, and there is no member-management endpoint at all
  (that is deferred task #51).
- Consequence, stated plainly: **`POST /api/loans/:id/approve` can only ever be a member
  approving their own loan**, because the same `eq(loansTable.userId, userId)` that isolates
  accounts is also the approval permission. `POST /api/loans` inserts `status: "Active"`
  directly (`turiwa.ts:211`), so the "Request a loan" button does not actually raise a
  request — it books the money and the Admin Loan Approvals queue (`loans.tsx:96`) only ever
  holds rows that arrived as `Pending` some other way.

That is a real product gap wearing a security costume: the app displays an approval
workflow it cannot enforce. It should not be sold in a pilot as four-eyes control until
shared membership exists.

## 3. Financial write operations

Every endpoint that moves a number:

| Write | Money rules applied | Identity used |
| --- | --- | --- |
| `POST /api/contributions` (`:61`) | amount finite, `> 0`, `Math.round`, `≤ 10,000,000` KES; type clamped to `LEDGER_TYPES`; note ≤ 160 chars; member name ≤ 60 chars; group must be owned | bearer session |
| `POST /api/circles` (`:107`) | contribution `> 0` and ≤ 10M; joining fee and welfare `0…1,000,000`; interest `0…100`; frequency clamped; `target = contribution × periods/year` | bearer session |
| `POST /api/loans` (`:171`) | amount finite, `> 0`, ≤ 10M; six-month quote from `quoteLoan()`; rate inherited from the group, never from the caller | bearer session |
| `POST /api/loans/:id/repay` (`:216`) | amount finite, `> 0`; `Math.max(balance − amount, 0)` so a balance cannot go negative; status flips to `Paid off` at zero | owner-only lookup |
| `POST /api/loans/:id/approve` (`:249`) | now refuses a repeat decision with `409` and a reason (task #54) | owner-only lookup |
| `DELETE /api/account` (`auth.ts:158`) | hard delete of circles, their contributions, loans, sessions and login rows | requires 2FA enabled **and** a code |

There is no currency column: every integer is implicitly KES, and the UI adds the
"KSh" prefix. Harmless while the product is Kenya-only; a real limitation the moment it is
not.

### Integrity findings

1. **No transactions.** Zero occurrences of `.transaction(` in the server. A multi-row
   write such as account deletion, or insert-then-`publishState`, can half-complete. For a
   ledger this is the class of bug that produces "the money is on one screen and not the
   other".
2. **No audit trail.** There is no history table and no update/delete path for a ledger
   row: entries are only ever inserted, so the ledger is append-only *by accident of the
   routes*, not by design. Nothing records who typed what.
3. **Every entry is booked `status: "Complete"`** (`turiwa.ts:94`) the moment it is typed.
   Nothing is ever reconciled against a provider.
4. **`member` is free text** (`turiwa.ts:68`), typed by whoever records the entry, while
   `totalContributed` on the roster is counted from `userId` (`store.ts:172`). The same
   screen therefore mixes a claimed attribution with a counted one and labels both
   "contributions".
5. **`date` is a string literal `"Just now"`** (`turiwa.ts:92`) and is what reaches the UI
   (`store.ts:202`). The rows do carry a real `created_at`, but it is used only for
   ordering. A monthly report built on `date` would be unreadable, and this must be fixed
   before any pilot group tries to reconcile a period.
6. **No provider or M-Pesa reference field.** Reconciliation — the second signature
   capability in the strategy doc — has nowhere to store what the provider said.

### Measured against the doc's five money states

The rule is that a displayed balance is never proof money exists. The current build can
express two of the five: **expected** (group contribution × roster) and **member-reported**
(an entry someone typed). *Provider-confirmed*, *allocated* and *disputed* have no columns,
no statuses and no UI. Any number on screen today is therefore, at best, a claim.

## 4. Authentication and transport

Working: sessions are 32 random bytes, server-side, 30-day expiry, deleted on sign-out and
on expiry (`auth.ts:48-69`); passwords are scrypt with a per-user salt and compared with
`timingSafeEqual`; the pino request serializer strips query strings, so a token in a URL is
not written to the logs; OTP codes die after five wrong tries and cannot be re-issued
faster than every 60s (`auth.ts:12-13`); codes are withheld from the caller unless
`SHOW_SMS_CODES=true` *and* `NODE_ENV` is not `production`.

Not working: `cors()` is called with no options (`app.ts:28`), so any origin can call the
API (it still needs a token); there is no `helmet`, so no security headers; and —
**two-factor authentication is configured and never checked at sign-in.** `/api/auth/sign-in`
verifies the password and mints a session; `twoFactorEnabledAt` is consulted only for
`/password/change`, `/2fa/*` and `DELETE /account`. A member who turns on 2FA believing
their group's money is protected by it is not. This is the most misleading finding in the
audit and belongs on the Day 5 list.

## 5. Fixed today

**(a) A session token in a URL is now accepted only by the live stream.**
`tokenFromRequest()` used to read `req.query.token` on every route, so a link pasted into
WhatsApp — with the token in it, in browser history, and in the `Referer` of any external
image — was a working write credential. `EventSource` is the one client that cannot set a
header, so it keeps the query parameter and everything else lost it
(`auth.ts:31-46`, new `requireAuthForStream` at `auth.ts:105`, `GET /events` repointed at
`turiwa.ts:20`). Proved against the running server:

```text
POST /api/contributions?token=<valid>   -> 401   (was 201)
POST /api/contributions  Authorization  -> 201
GET  /api/state?token=<valid>           -> 401   (was 200)
GET  /api/events?token=<valid>          -> 200   (stream still live)
```

**(b) Password guessing is throttled.** `artifacts/api-server/src/lib/guard.ts` is new:
8 failed attempts against one number in 15 minutes locks it for 15 minutes, keyed on the
identifier rather than the IP so rotating addresses buys nothing, and cleared on success.
Proved by `.verify/login-throttle.mjs` — 13 checks, all passing: attempts 1–8 answer `401`,
the 9th answers `429` with `Retry-After: 900` and "Too many wrong passwords. Wait 15
minute(s)…", **the correct password is refused while locked**, and a different number is
unaffected.

Known limitation, deliberately not hidden: the counter lives in one process's memory, so a
restart clears it and a second API instance has its own. That is acceptable for a
single-process pilot and must move to the database before more than one instance runs.

## 6. What to do about it, in order

| # | Risk | Effort | Blocking a pilot? |
| --- | --- | --- | --- |
| 1 | 2FA never checked at sign-in | Small (one step in `/sign-in` + a second-screen in the client) | Yes — it claims a protection it does not provide. Either enforce it or stop showing it as security |
| 2 | Ledger dates are the string `"Just now"` | Small (store `created_at`, format on read) | Yes — a group cannot reconcile a week without it |
| 3 | No real admin approval; requests auto-activate | Large (shared membership = task #51) | No, if the pilot is told the truth: one record-keeper per group |
| 4 | No transactions, no FKs, no audit table | Medium | Not for 5 groups, but it is the difference between a ledger and a note |
| 5 | Money states collapsed into "Complete" | Medium (statuses + provider reference column) | Yes for the Reconciliation Engine story |
| 6 | No RLS because there is no server Postgres | Follows task #28 | No — app-layer isolation is currently correct |
| 7 | `cors()` wide open, no helmet | Trivial | Low while the API is Bearer-only; close before a public URL |
| 8 | No SMS sender (task #59 / memory note) | Outside this codebase | **Yes** — phone sign-up and password reset are dead ends |

## 7. Pilot sign-off

Safe to run a 5-group pilot on the current build **if** all four hold:
1. Each pilot group has one record-keeper on one account (no cross-account members exist yet).
2. Nobody is told 2FA protects their sign-in until finding 1 above is closed.
3. `SHOW_SMS_CODES` is off in anything a real person signs up on.
4. `node scripts/backup-db.mjs` runs before every session, on a stopped API.
