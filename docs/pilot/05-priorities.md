# Day 5 — The three improvements that buy trust and adoption

Date: 2026-10-14. Scored from the evidence gathered on Days 1–3, not from what the codebase
made comfortable. **Day 4's interviews are supposed to change this list** — the scorecard
says how, in §4. Until the interviews are in, treat these as the working bets.

## 1. What was on the table

Everything the audit and the test cycle surfaced, with the evidence:

| Candidate | Evidence | Trust | Adoption | Effort |
| --- | --- | --- | --- | --- |
| **Loans inside the ledger → one real group-cash figure** | Day 3 §2: 10,000 out and 17,716 back moved the balance by 0; `Repayment` exists as a type (`store.ts:24`) but is unlinked | 5 | 5 | M |
| **Close a month: real dates, monthly report, CSV export** | Day 3 §2.1: every row's date is the literal `"Just now"` (`turiwa.ts:92` → `store.ts:202`); `created_at` exists but is only used for ordering | 4 | 5 | S |
| **Shared groups: members with accounts, roster-based attribution, a real second approver** | Day 2 §2: `role` is never read for authorization; approval is self-approval; `member` is free text (Day 3 §2.3); deferred task #51 | 5 | 3 | L |
| **Provider confirmation: M-Pesa reference + confirmed/disputed status per row** | Day 2 §3: every entry is booked `status: "Complete"` on typing (`turiwa.ts:94`); no reference column; the doc's five money states reduce to two | 5 | 2 | L (needs a gateway) |
| **Enforce 2FA at sign-in, or stop showing it** | Day 2 §4: `/auth/sign-in` never consults `twoFactorEnabledAt` | 3 | 1 | S |
| **Joining fee as a recordable entry** | Day 3 §2.2: it is a group column, and the first money a real chama collects | 2 | 3 | S |
| **Real Postgres + RLS + scheduled backups** | Day 2 §1: zero policies, zero `.sql`, PGlite single-user; Day 1: backup exists but nothing schedules it; task #28 | 4 | 1 | M |
| **An SMS sender so phone sign-up works** | Project memory + Day 2 §6.8: sign-up and password reset are dead ends today | 3 | 4 | S (outside this code) |

Scoring is *trust* = how much it changes what a member believes about the numbers,
*adoption* = how much it changes whether a group keeps using it after week one, *effort*
relative to this codebase (S ≈ a day or two, M ≈ a week, L ≈ a month or an external
dependency).

## 2. The three that made the cut

### 1 · Put loans in the ledger, so the group has one number to point at

**Do:** a loan disbursement writes a `Lent` outflow row and a repayment writes a
`Repaid` inflow row, both linked to the loan id; the group's cash figure is derived from
the ledger instead of ignoring it; the loan screen shows "this money came from the group
pot" next to the balance. The unlinked hand-typed `Repayment` entry stops being a thing a
treasurer can double-count.

**Why first:** it is the only finding that makes the app *wrong in front of a member*. A
treasurer who lends 10,000 and then says "we have 550" is going to be asked a question the
app cannot answer, and the moment that happens the book goes back to Excel. It also fixes
the double-count trap rather than adding a new capability.

**Definition of done:** the Day 3 harness's "neither moved the group balance" check flips to
the opposite assertion — a cycle changes cash by −10,000 then +17,716, and `netBalance`
agrees with the sum of the rows including loans. Nothing else in the app changes.

**Moves:** the pilot metric "0 unexplained discrepancies" from luck to design.

### 2 · Let a treasurer close a month

**Do:** store and show the real entry date (already in `created_at`), let the recorder
correct a date at entry time, add a period filter (this month / last month / this term) to
Activity and the group screen, a per-period total, and a CSV export of the rows behind any
figure.

**Why second:** this is the smallest build with the most daily-use payoff — it is exactly
what an official does at the end of every meeting, and it is the difference between "an
app" and "our records". It also makes the interviews and demos legible: a group can be
shown *their* month rather than a screen of `Just now`.

**Definition of done:** entries created on different days render different dates and sort
correctly; a month filter's total equals the sum of the visible rows; the export opens in
Excel with the same total. (Today `date: "Just now"` is set at `turiwa.ts:92` and copied
through `store.ts:202` — the field to change is one line and a formatter.)

**Moves:** weekly active, because the record becomes usable for the one ritual that matters.

### 3 · Make a group belong to its members, not to one phone number

**Do:** invite a member to an account, roster entries keyed to real users, a read-only view
for members, and then — and only then — a second-party approval on loans and any expense
above a threshold the group sets.

**Why third:** it is the highest-trust item in the table (Day 2 §2: an "admin" who can only
approve their own loan is theatre, and members who cannot see the book cannot trust it),
but it is also the largest build and its value depends on question 15 of the interview —
*would you actually want every member to see the book?* Building it before that answer is
in risks solving a problem some chamas deliberately do not want solved.

**Sequencing inside the item:** read-only member visibility first (it is the trust win and
it is smaller), shared write permissions second, four-eyes approval third — and #51 stays
deferred until the interviews land.

**Definition of done:** two accounts in one group; member B sees the same ledger without
being able to write; a loan raised by A can only be approved by B; `role` is read by the
server.

## 3. Explicitly not on the list, with the reason

- **M-Pesa provider confirmation** scored the highest on trust and lost on feasibility: it
  needs a gateway account and a staffed reconciliation loop, and it is the product's second
  signature feature, not a week's work. Park it as the Reconciliation Engine design task,
  with the schema decision (a `provider_reference` + `confirmation_status` column) recorded
  in the Day 2 audit so the ledger item above does not paint it into a corner.
- **Enforce 2FA at sign-in** is not a product improvement, it is a claim we are currently
  making. Fix or remove before the first pilot demo — one day's work, tracked separately,
  and §4 of the audit is the spec.
- **RLS / hosted Postgres / scheduled backups** are infrastructure: necessary before real
  money, invisible to a pilot group, and already tracked as task #28 with Day 1's backup
  script in place.
- **An SMS sender** is a launch blocker, not a feature, and it is the user's account to open
  (Africa's Talking is the suggested Kenyan default).

## 4. How the interviews should change this

| If two or three officials say | Then |
| --- | --- |
| "M-Pesa is my book, I copy from the SMS" | provider confirmation jumps to #2 and item 3 waits |
| "Only the officials should see it" | drop member visibility from item 3; keep four-eyes approval |
| "The treasurer must not hold both the money and the book" | item 3 outranks item 2 |
| "I record at home the same evening" | item 2 (dates, period totals) is the demo's centrepiece |
| "We've never had a dispute about balances" | item 1 is still #1 — it is a correctness fix, not a preference |
| Nothing above KSh 0 | pricing, not product, is the blocker; do not build item 3 for a group that will not pay |
