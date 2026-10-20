# Day 6 — Demonstration workspace and onboarding guide

Date: 2026-10-14. The workspace exists, it is seeded, and every number in it was read back
through the same API a pilot group would use (`.verify/day6-demo.mjs`, 18 checks, all
passing).

## 1. What the demo workspace is

A group called **Kiama Demo Chama (synthetic data)** inside its **own database**
(`artifacts/api-server/data/demo`), served by its **own API process on port 5051**. Real
records live in `data/turiwa` on port 5000; the two cannot see each other, and neither the
seeder nor the demo server has any path to the live data.

| What it contains | Detail |
| --- | --- |
| 1 sign-in | `+254700000700` / `demo123` — the demo treasurer, **only valid against port 5051** |
| 1 group | Monthly, KSh 500 a member, joining fee 200, welfare 100, 10% a month on loans, annual target 6,000 |
| 8 roster entries | Every name ends "(synthetic)"; the treasurer is `admin`, the rest are `member` |
| 26 contributions | 500 each across six meetings (May–October 2026), some members absent at some meetings |
| 3 outflow entries | Hall rent 1,000 and chairs 2,400 as `Expense`; 1,500 sent to a member's family as `Welfare` |
| 2 loans | Running: 6,000 at 10%/month → 10,629 over six months, one instalment paid. Waiting: 2,000 → 3,543, still `Pending` so the approval queue is a real place |
| The arithmetic | 13,000 in − 3,400 spent − 1,500 set aside = **8,100 spendable**, and the screens' own rules produce that number |

Recreate or reset it at any time:

```bash
cd artifacts/api-server
node build.mjs
rm -rf data/demo
DATABASE_URL=pglite://data/demo node --env-file=../../.env dist/index.mjs --seed-demo
# -> "Seeded 8 members, 29 ledger rows and 2 loans into the demo group."
```

**It will refuse to run against real records.** The seeder only clears the two built-in
demo fixtures ("Harambee Queens", "Greenview Estate" — groups with plausible Kenyan names
that say nowhere they are invented, which is why they must not be what you show a paying
customer). If the database holds any account or group that is not one of those fixtures, it
stops:

```text
Refused: this database holds records that are not the built-in demo fixtures.
Point DATABASE_URL at a fresh directory and run --seed-demo again.
```

(proved against `data/verify-day3`, which holds two real test accounts.)

## 2. Start it for a call

```bash
# terminal 1 — the backend the demo reads
cd artifacts/api-server
DATABASE_URL=pglite://data/demo PORT=5051 node --enable-source-maps --env-file=../../.env dist/index.mjs

# terminal 2 — the app pointed at that backend, on its own port
cd artifacts/turiwa-mobile
EXPO_PUBLIC_API_URL=http://localhost:5051 npx --yes pnpm@10 exec expo start --web --port 8082
```

Then `http://localhost:8082`, sign in with the numbers in §1. Check the app is really on the
demo backend before you share your screen: the group must read *Kiama Demo Chama
(synthetic data)*.

## 3. The twelve-minute walk-through

Say the first line out loud before anything else: **"everything you are about to see is
made-up data — there is no real group or person in here."**

| Min | Show | Say |
| --- | --- | --- |
| 0–2 | Sign in, Home | "This is the treasurer's opening screen: what the group holds, what is owed to it, what is set aside." |
| 2–4 | The group screen: 8 members, 6 meetings of rows | "Six months of a monthly group of eight at 500 shillings. Everyone in the group can see the same list at the same time." |
| 4–6 | Record one contribution in front of them | "This is the whole job at a meeting: amount, who paid, note, done. It takes ten seconds and everybody watches it land." |
| 6–8 | Activity filter, then the expense and welfare rows | "Money out is a row too, so the book explains itself. Welfare is kept apart from spending — it is still the group's money, just not spendable." |
| 8–10 | Loans: the running one, then approve the pending one on a second device | "Rates come from the group's own rule, and the repayment schedule is worked out before anybody borrows." |
| 10–12 | Profile: sign out, sign in again, 2FA setup | "The book is behind a password, codes expire, and a device that signs out loses its session." |

Then stop showing and ask: *"which of these would you have used at your last meeting?"*

## 4. What to admit before they find it

Do not present these as roadmap slides. Say them plainly, in the same breath as the feature
they touch, and write down how each one lands with the person in front of you — that is
Day 7's data.

1. **A loan does not move the group's cash figure.** Lending is tracked in its own book and
   never becomes a ledger row, so the balance stays put when 6,000 leaves the group. Day 3
   §2 is the measurement; priority #1 (§2 of `05-priorities.md`) is the fix.
2. **Rows are dated "Just now" on screen.** The real entry time is stored but not shown, so
   a month cannot be closed yet. A pilot group can only use this for the current cycle
   until priority #2 lands.
3. **One person records; members cannot have accounts yet.** There is no second login into
   someone else's group, so a demo of "the treasurer records, the chair approves" is not
   available — the approval queue only ever holds the record-keeper's own requests.
4. **Nothing is confirmed against M-Pesa or a bank.** Every entry is what someone typed.
   Say the five states out loud: this build can show expected and member-reported; it cannot
   show provider-confirmed, allocated or disputed.
5. **A joining fee cannot be recorded as an entry.** It is a rule on the group, not a money
   row, so the first cash a chama collects has nowhere to go.
6. **Two-factor authentication does not guard sign-in yet.** It protects password changes and
   account deletion. Do not demonstrate it as protection for the group's money.
7. **New phone numbers cannot sign themselves up** until an SMS sender is connected. A pilot
   member must be created by whoever holds the server, or sign in with Google.

If a group is only willing to move once 1–4 are done, that is a correct decision and useful
information — take it, and do not sell past it.

## 5. Onboarding guide for a pilot group (one page, send it after the call)

**Before the first meeting (10 minutes, one person)**
1. Sign in on the treasurer's phone. If the sign-up screen cannot text a code, ask Turiwa to
   open the account and set a password for it.
2. Create the group with its real rules: how much a member pays, how often, joining fee,
   welfare, and the interest the group charges. These are the numbers every report is built
   from, so get them from the constitution, not from memory.
3. Write on paper the **opening balance** and the date it was counted, and take a photo of
   the last page of the current exercise book. Turiwa starts at zero; the book does not.

**At the meeting (the only habit that matters)**
4. Record contributions **in front of the members**, one per person, as the money arrives.
   Nobody should go home with a payment unrecorded.
5. Record expenses the same way, and pick Welfare for anything set aside rather than spent.
6. Read the group's balance aloud at the close of the meeting. If it disagrees with the box
   the money came in, stop and find out why before anyone leaves — that disagreement is the
   thing this tool exists to make impossible to hide.

**After the first month**
7. Screenshot the Activity list and send it to the chair. (A real export is coming; for now
   the list *is* the report.)
8. Send Turiwa one number a week: how many entries were recorded, and whether anybody
   argued about the book. Those are the two numbers the pilot is measuring.

**What to do when Turiwa and the book disagree:** trust the book, record the disagreement,
and send it in. The app is being tested against a record that has worked for years; that
comparison is the pilot's most valuable output.

## 6. Reset after a demo

The walk-through writes rows (a contribution, an approval). Between calls, reset rather than
delete rows one by one — §1's three commands, then restart the port 5051 process. The proof
run in `.verify/day6-demo.mjs` deliberately approves and closes the pending loan, so after a
proof run the workspace needs that reset before the next call.
