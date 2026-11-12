import { and, eq, inArray, or } from "drizzle-orm";
import { contributionsTable, getDb, loansTable, usersTable, type Loan } from "@workspace/db";
import { newId } from "./ids";
import { logger } from "./logger";

type LoanDbExecutor = Pick<ReturnType<typeof getDb>, "insert" | "select">;

const fundedStatuses = ["Active", "Paid off"];
const isFunded = (loan: Loan) => fundedStatuses.includes(loan.status);

/** The three things a ledger row should be able to answer about itself: whose hand
 *  typed it, how the money arrived, and the slip that names it. All optional — a
 *  borrower who says nothing gets nothing stored, and the app never fills the gap with
 *  a plausible-sounding default. */
export type LedgerAudit = {
  recordedBy?: string | null;
  method?: string | null;
  reference?: string | null;
};

const text = (value: string | null | undefined) => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

// A loan moves the group's cash: the fund hands the principal out, and the member
// pays it back in instalments. Both movements are ledger entries, so the balance on
// screen is the sum of the ledger and nothing else — a group cannot show money it has
// already lent, nor hide money it has been given back.
//
// Funded legacy loans with no journal records can be reconciled from their locked
// row: `principal` went out and `total_payable - balance` came back. Once either side
// is journalled, that balance cannot prove which historical movements are missing.

/** What the ledger writes when a funded loan's money moves. Only the stored Active
 *  and Paid off statuses prove approval; requests and unknown statuses move no cash.
 *
 *  `audit` is who recorded the movement and how the cash arrived. It is stored on the
 *  entry, never derived: a payout retried under the same loan id keeps the first
 *  recorder, because the second write is the retry, not a second decision. */
export async function recordLoanDisbursement(
  loan: Loan,
  date: string,
  executor: LoanDbExecutor = getDb(),
  audit: LedgerAudit = {},
): Promise<boolean> {
  if (!isFunded(loan) || !loan.circleId) return false;
  const rows = await executor
    .insert(contributionsTable)
    .values({
      id: `loan-disb-${loan.id}`,
      circleId: loan.circleId,
      userId: loan.userId,
      amount: loan.principal,
      date,
      note: `Loan paid out — ${loan.purpose}`,
      status: "Complete",
      type: "LoanDisbursement",
      member: await memberName(loan.userId, executor),
      loanId: loan.id,
      recordedBy: audit.recordedBy ?? null,
      method: text(audit.method),
      reference: text(audit.reference),
    })
    .onConflictDoNothing()
    .returning({ id: contributionsTable.id });
  return rows.length > 0;
}

/** One repayment, in the moment it happens, so the fund's cash and the loan's
 *  remaining balance always move by the same amount. */
export async function recordLoanRepayment(
  loan: Loan,
  amount: number,
  executor: LoanDbExecutor = getDb(),
  entryId = newId("c"),
  audit: LedgerAudit = {},
): Promise<void> {
  if (!loan.circleId || amount <= 0) return;
  await executor.insert(contributionsTable).values({
    id: entryId,
    circleId: loan.circleId,
    userId: loan.userId,
    amount,
    date: "Just now",
    note: `Loan repayment — ${loan.purpose}`,
    status: "Complete",
    type: "Repayment",
    member: await memberName(loan.userId, executor),
    loanId: loan.id,
    recordedBy: audit.recordedBy ?? null,
    method: text(audit.method),
    reference: text(audit.reference),
  });
}

/** Backfill only wholly unjournalled funded loans. Partial histories need review,
 *  not another repayment inferred from a balance that already includes journalled cash. */
export async function linkExistingLoans(): Promise<{ linked: number; ungrouped: number; ambiguous: number }> {
  const db = getDb();
  const loans = await db.select({ id: loansTable.id }).from(loansTable)
    .where(inArray(loansTable.status, fundedStatuses));
  let linked = 0;
  let ungrouped = 0;
  let ambiguous = 0;
  for (const { id } of loans) {
    const outcome = await db.transaction(async (tx) => {
      // Approval and repayment also lock this row. Never reconcile the scan's stale
      // snapshot, or let another repair observe just one half of this legacy pair.
      const [loan] = await tx.select().from(loansTable).where(eq(loansTable.id, id))
        .for("update").limit(1);
      if (!loan || !isFunded(loan)) return "skipped";
      if (!loan.circleId) return "ungrouped";

      const entries = await tx.select({ id: contributionsTable.id, type: contributionsTable.type })
        .from(contributionsTable)
        .where(or(
          and(
            eq(contributionsTable.loanId, loan.id),
            inArray(contributionsTable.type, ["LoanDisbursement", "Repayment"]),
          ),
          // Also recognise old deterministic ids if their loan link is missing.
          inArray(contributionsTable.id, [`loan-disb-${loan.id}`, `loan-repaid-${loan.id}`]),
        ));
      if (entries.length > 0) {
        const hasPayout = entries.some((entry) => entry.type === "LoanDisbursement");
        const hasRepayment = entries.some((entry) => entry.type === "Repayment");
        // A payout alone is normal when nothing has yet been repaid. Otherwise a
        // missing side is ambiguous, even if today's balance suggests an amount.
        if (!hasPayout || (!hasRepayment && loan.balance < loan.totalPayable)) return "ambiguous";
        return "skipped";
      }

      const fresh = await recordLoanDisbursement(loan, "On file", tx);
      if (!fresh) return "ambiguous";
      const repaid = Math.max(loan.totalPayable - loan.balance, 0);
      if (repaid > 0) {
        await tx.insert(contributionsTable).values({
          id: `loan-repaid-${loan.id}`,
          circleId: loan.circleId,
          userId: loan.userId,
          amount: repaid,
          date: "On file",
          note: `Loan repayments already on file — ${loan.purpose}`,
          status: "Complete",
          type: "Repayment",
          member: await memberName(loan.userId, tx),
          loanId: loan.id,
        });
      }
      return "linked";
    });
    // Count only committed work; a failed second insert rolls back the payout too.
    if (outcome === "linked") linked += 1;
    if (outcome === "ungrouped") ungrouped += 1;
    if (outcome === "ambiguous") {
      ambiguous += 1;
      logger.warn(
        { loanId: id },
        "Loan has a partial or conflicting journal — review its history; no ledger entries were inferred",
      );
    }
  }
  if (ungrouped > 0) {
    logger.warn(
      { ungrouped },
      "Funded loans have no group link, so their cash is not in any group ledger — attach them to a group to reconcile",
    );
  }
  return { linked, ungrouped, ambiguous };
}

async function memberName(userId: string | null, executor: LoanDbExecutor = getDb()): Promise<string | null> {
  if (!userId) return null;
  const [user] = await executor
    .select({ name: usersTable.name })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  return user?.name ?? null;
}
