import { eq } from "drizzle-orm";
import { contributionsTable, getDb, loansTable, usersTable, type Loan } from "@workspace/db";
import { newId } from "./ids";
import { logger } from "./logger";

type LoanDbExecutor = Pick<ReturnType<typeof getDb>, "insert" | "select">;

// A loan moves the group's cash: the fund hands the principal out, and the member
// pays it back in instalments. Both movements are ledger entries, so the balance on
// screen is the sum of the ledger and nothing else — a group cannot show money it has
// already lent, nor hide money it has been given back.
//
// Loans saved before this existed only ever changed their own balance column, so each
// one gets its entries derived from what the row itself records: `principal` went out,
// and `total_payable - balance` has come back. The ids are built from the loan, which
// makes the repair run exactly once no matter how many times the server starts.

/** What the ledger writes when a loan's money moves. Pending requests are excluded by
 *  the caller: nothing has left the fund until the group says yes. */
export async function recordLoanDisbursement(loan: Loan, date: string, executor: LoanDbExecutor = getDb()): Promise<boolean> {
  if (!loan.circleId) return false;
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
    })
    .onConflictDoNothing()
    .returning({ id: contributionsTable.id });
  return rows.length > 0;
}

/** One repayment, in the moment it happens, so the fund's cash and the loan's
 *  remaining balance always move by the same amount. */
export async function recordLoanRepayment(loan: Loan, amount: number, executor: LoanDbExecutor = getDb(), entryId = newId("c")): Promise<void> {
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
  });
}

/** Loans already on file, with the money they moved but never recorded. A loan that
 *  belongs to no group has no group ledger to write into, and is reported instead. */
export async function linkExistingLoans(): Promise<{ linked: number; ungrouped: number }> {
  const db = getDb();
  const loans = await db.select().from(loansTable);
  let linked = 0;
  let ungrouped = 0;
  for (const loan of loans) {
    if (!loan.circleId) {
      // A loan row saved before groups were recorded has no ledger to join, so the
      // money it moved stays invisible to every group total until it is linked.
      if (loan.status !== "Pending") ungrouped += 1;
      continue;
    }
    if (loan.status === "Pending") continue;
    const fresh = await recordLoanDisbursement(loan, "On file");
    if (!fresh) continue;
    linked += 1;
    // Repayments made before this ran are only known from the loan's own balance,
    // so they arrive as the one figure the row proves, not as invented instalments.
    const repaid = Math.max(loan.totalPayable - loan.balance, 0);
    if (repaid > 0) {
      await db
        .insert(contributionsTable)
        .values({
          id: `loan-repaid-${loan.id}`,
          circleId: loan.circleId,
          userId: loan.userId,
          amount: repaid,
          date: "On file",
          note: `Loan repayments already on file — ${loan.purpose}`,
          status: "Complete",
          type: "Repayment",
          member: await memberName(loan.userId),
          loanId: loan.id,
        })
        .onConflictDoNothing();
    }
  }
  if (ungrouped > 0) {
    logger.warn(
      { ungrouped },
      "Loans have no group link, so their cash is not in any group ledger — attach them to a group to reconcile",
    );
  }
  return { linked, ungrouped };
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
