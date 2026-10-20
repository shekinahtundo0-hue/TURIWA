# Day 3 — One full cycle of a group's money, on test data

Date: 2026-10-14. Run against a **throwaway database**, not the demo data: a second API
process on port 5050 with `DATABASE_URL=pglite://data/verify-day3`, `NODE_ENV=development`,
`SHOW_SMS_CODES=true`. Nothing in this document touched the live ledger.

```bash
# from artifacts/api-server
DATABASE_URL=pglite://data/verify-day3 PORT=5050 NODE_ENV=development SHOW_SMS_CODES=true \
  node --enable-source-maps dist/index.mjs
# from the repo parent
node .verify/day3-workflow.mjs
```

The harness signs up two fresh accounts with random phone numbers (so a re-run never
reuses rows), and it **recomputes every total from the raw ledger rows** with the client's
own rules (`context/TuriwaContext.tsx:364-395`) instead of believing the API's arithmetic.

## Scenario, and what each step proved

A treasurer, KSh 500 a month, four paying members, one borrowing member. **40 checks, all
passing, twice in a row on the same server** (`.verify/day3-workflow.mjs`).

| Step | Result |
| --- | --- |
| New account signs in, reads its own profile | pass |
| New account sees **zero** groups, rows and loans | pass — `circles=0 rows=0 loans=0` |
| Create "Mashujaa Test Chama" (Monthly, 500, joining 200, welfare 100, 10%/month) | pass — target 6,000 = 500 × 12 |
| Roster at creation | pass — the creator alone, role `admin` |
| Four contributions 500+500+500+400 | pass — `contributed = 1,900` |
| One welfare entry 100 | pass — counted as **set aside**, not spent |
| Two expenses 250 + 1,000 | pass — `outflow = 1,250` |
| Group balance | pass — `1,900 − 1,250 − 100 = 550` spendable |
| Loan 10,000 through the group at its own rate | pass — `totalPayable = 17,716` = round(10,000 × 1.1⁶), `monthlyRepayment = 2,953` = ceil(17,716 ÷ 6) |
| The loan keeps its group | pass — `circleId` = the group, and the rate came from the group, not the caller |
| One instalment | pass — balance 14,763, still `Active` |
| Repaying more than is owed | **fixed today** — see §3 |
| Paying the rest | pass — balance 0, status `Paid off` |
| Two reads of the ledger agree byte-for-byte | pass |
| Per-circle report total = sum of that circle's rows | pass — 550 |
| A stranger account sees nothing | pass |
| Stranger pays out of the group | pass — `403` |
| Stranger repays / approves the loan | pass — `404`, reads as absent |
| amount 0, negative, `"abc"`, 999,999,999, no group, someone else's group | pass — `400/400/400/400/400/403` |
| `type: "Fraud"` | pass — falls back to `Contribution` rather than inventing a ledger side |
| 400-character member name and note | pass — cut to 60 and 160 |
| `1500.7` | pass — booked as 1,501 whole shillings |
| Sign out, then reuse the token | pass — `401` |

## 2. The discrepancy the cycle exposes

The checklist asked for a "complete contribution, expense, loan repayment and reporting
workflow". The workflow runs. The **report does not reconcile**, and the harness pins the
number down:

```text
10,000 left the group as a loan and 17,716 came back to it —
and neither moved the group balance.        net before = 550, after = 550
what the ledger holds about the loan: nothing. no disbursement row, no repayment row
```

Lending is the biggest movement of cash a chama makes, and it is invisible to the ledger:

- Booking a loan writes a row in `loans` and **nothing** in `contributions`.
- A repayment updates `loans.balance` and writes **no** ledger row either.
- So `netBalance` (what the Home and Circle screens show as the group's money) never
  changes across an entire loan cycle, while `outstanding` falls by 17,716. There is no
  figure anywhere that says what the group actually holds.
- The ledger type `"Repayment"` **does exist** (`store.ts:24`) and a member can record one
  by hand (`TuriwaUI.tsx:306` even explains it: "Money coming back from a loan."). It is
  not linked to the loan it settles, so typing one and repaying the loan counts the same
  money twice, and typing neither loses it. A treasurer will do one or the other depending
  on the day.

Consequences for the pitch: the Reconciliation Engine cannot be demonstrated on top of
this shape yet, and the doc's five money states collapse to two. **Ledger cash, loan book,
and group balance are three records that never talk to each other.** This is the single
most important finding of the week and it is a design gap, not a bug — it needs a decision
about whether loans are *inside* the ledger (a disbursement row plus a repayment row, with
the loan balance derived) or a satellite of it.

Three smaller reporting defects the same run found:

1. **Every row's date is the string `"Just now"`** (`turiwa.ts:92`, passed through by
   `store.ts:202`). Rows do carry a real `created_at`, used only for ordering. A report of
   "this month" is impossible today; a treasurer closing a month cannot tell a row entered
   today from one entered on the 1st.
2. **A joining fee cannot be recorded at all** — it is a column on the group
   (`circles.joiningFee`), while `LEDGER_TYPES` is `Contribution | Expense | Repayment |
   Welfare`. In a real chama the joining fee is the first money in.
3. **`member` is free text** (labels in this run: Achieng, Otieno, Wanjiru, Kiptoo,
   Supplier, Landlord) while the roster's `totalContributed` is counted from `userId`
   (`store.ts:172`). The name on an entry has no bearing on any total, so a treasurer can
   credit anyone — including a person who is not in the group — and the numbers will not
   notice.

## 3. Fixed while testing

**Money cannot be paid into a loan that owes nothing** (`turiwa.ts:236-248`):

| Case | Before | Now |
| --- | --- | --- |
| Repay 5,000 on a paid-off loan | `200`, balance still 0, no row anywhere for the 5,000 | `409` "This loan is already paid off." |
| Repay 20,000 on a loan owing 14,763 | clamped silently to "paid off", 5,237 vanishes from every total | `400` "That is more than the KES 14,763 still owing on this loan." |

The client already promised this (loans.tsx:288 blocks an over-balance submit) — the server
now enforces the promise instead of relying on the form. The repayment sheet's prefilled
amount changed too, from "one month's instalment" to `min(monthly instalment, what is
left)`, because the last payment is usually smaller and would otherwise open the sheet in
an error state (`loans.tsx:284-288`).

Re-verified after the change: the mobile typecheck is clean, the API typecheck and build are
clean, and the live server on port 5000 restarted with the same binary.

## 4. What to say in the pilot about reports

Be exact: Turiwa keeps **one group's record of what the record-keeper typed**, and it keeps
it consistently — two reads agree, per-circle totals equal their rows, and no bad number
becomes money. What it does **not** yet do is tell you the group's cash, cover a loan in the
report, or group entries by date. Do not demonstrate "reports" as reconciliation;
demonstrate it as "everyone can see the same list, at the same time, and nobody can quietly
edit a past entry."
