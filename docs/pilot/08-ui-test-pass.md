# 08 — UI test pass against the running app

Date: 2026-10-14. Everything below was observed in headless Chrome driving the real
Expo web bundle, not inferred from reading code.

## How it was run

Three harnesses in the outer `.verify/` directory, all pointed at the **labelled synthetic
demo workspace** (port 5051, `data/demo`) so no invented record can land in the live
database:

| Harness | What it does | Result |
| --- | --- | --- |
| `app-ui-probe.mjs` | Signs in through the real form, walks every tab at 390×844 and 1440×1000, cross-checks the on-screen total against `GET /api/state` | ROUND 1 PASSED (17 checks) |
| `app-ui-writes.mjs` | Records a contribution through the ledger sheet, forces a server refusal, repays a loan, signs out | ROUND 2 PASSED (28 checks) |
| `app-ui-loans.mjs` | Requests and approves credit, renames the profile, desktop pass, audits every URL the app called | ROUND 3 PASSED (31 checks) |

Screenshots: `.verify/shots/app-ui/` (23 files). Reset the workspace afterwards with
`node dist/index.mjs --seed-demo` against a fresh `data/demo`.

## What held up

- **The arithmetic on the screen is the arithmetic in the database.** 29 ledger rows add up
  to KES 8,100 and Home shows exactly that; a committed 700 moved it to 8,800 in the same
  screen without a reload.
- **A server refusal is shown, not swallowed.** With `POST /api/contributions` forced to
  return 409, the sheet stayed open, printed the server's sentence verbatim in red under the
  memo field, and the row count did not change.
- **Repayment guards work at both ends.** The field prefills one instalment (1,772, not the
  8,857 balance), an over-balance amount is warned about on the spot and cannot be committed,
  and a valid 1,772 moved the API balance to 7,085.
- **Credit quotes are honest.** A 3,000 request at 10%/month quoted KES 5,315 over 6 months
  at KES 886 each — matching `round(P×1.1^6)` and `ceil(total/6)` exactly.
- **Sign-out really ends the session.** Storage holds `{"signedIn":false}`, the welcome
  screen returns, and the previous token now gets HTTP 401 from the API.
- **Nothing reached the live database.** Every API URL the app requested during round 3 was
  on `localhost:5051`; the live workspace still holds its own 6 rows with no test records.

## Fixed while testing

- `PrimaryButton` — the app's main CTA component — rendered with **no `accessibilityRole`**,
  so every "Request a loan", "Contribute", "Confirm repayment" was plain text to a screen
  reader and had no role for assistive tech. Now `role="button"` plus a label
  (`components/TuriwaUI.tsx:135`), verified in the live DOM.
- The **Sign out** control on Profile had no role and no test handle (`app/(tabs)/profile.tsx:89`).
- The **back button** on the auth screens is icon-only with no accessible name
  (`components/AuthUI.tsx:44`).
- "1 groups · everything in one place" on Circles, and "1 active groups" on the Home tile,
  now pluralise (`app/(tabs)/circles.tsx:47`, `app/(tabs)/index.tsx:140`).

## Open findings, in the order they will cost trust

1. **A loan a member requests is never pending.** `POST /loans` hardcodes
   `status: "Active"` (`artifacts/api-server/src/routes/turiwa.ts:209`), so the request is
   recorded as already disbursed. The Admin Loan Approvals hub and the approve route — which
   rejects anything not Pending (`turiwa.ts:282`) — can only ever show loans the seeder made.
   Proven in the UI: the new loan appeared as Active and the queue stayed at (1).
   This belongs to work item **#70**.
2. **Lending is invisible to the group's cash figure.** Net balance was 8,100 before a
   3,000 borrow, after it, and after a 1,772 repayment. Meanwhile the approval banner says
   *"Loan approved — it now counts against the group."* It does not count in the one number
   members look at. Work item **#68**.
3. **"Review request" has no review step.** The button commits the application immediately
   (`app/(tabs)/loans.tsx:277`).
4. **23 interactive `Pressable`s still render without a role.** Re-run
   `.verify/role-audit.mjs` from `artifacts/turiwa-mobile` for the current list — it counts
   only tags with `onPress` and no `accessibilityRole`. Work item **#58**.
5. **The password field is not inside a `<form>`**, so Chrome will not offer to save or
   autofill it and Enter does not submit. Chrome logs this on every sign-in screen.
6. Minor console noise on web: `"shadow*" style props are deprecated` on each boot, and
   Chrome blocking `navigator.vibrate` from `Haptics` calls.
