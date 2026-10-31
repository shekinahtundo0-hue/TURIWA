import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { circlesTable, contributionsTable, getDb, loansTable } from "@workspace/db";
import { requireAuth, requireAuthForStream, type AuthedRequest } from "../lib/auth";
import { newId, newJoinCode } from "../lib/ids";
import { asInterestPeriod, LOAN_MONTHS, quoteLoan } from "../lib/loanMath";
import { subscribe } from "../lib/realtime";
import { FREQUENCIES, circleCash, getState, publishState, RECORDABLE_LEDGER_TYPES, type Frequency, type LedgerType, type RecordableLedgerType } from "../lib/store";
import { recordLoanDisbursement, recordLoanRepayment } from "../lib/loanLedger";
import { formatDay, isoDay, kes } from "../lib/money";
import { dueAfterMonths } from "../lib/loanMath";

const router: IRouter = Router();

function userIdOf(req: Request): string {
  return (req as AuthedRequest).user!.id;
}

router.get("/state", requireAuth, async (req, res) => {
  res.json(await getState(userIdOf(req)));
});

router.get("/events", requireAuthForStream, (req, res) => {
  const userId = userIdOf(req);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  // Hosted APIs usually sit behind nginx, which buffers responses and would hold
  // every pushed state until the buffer fills.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  subscribe(res, userId);
  void getState(userId).then((state) => {
    res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
  });
  const heartbeat = setInterval(() => {
    res.write(": ping\n\n");
  }, 15000);
  req.on("close", () => {
    clearInterval(heartbeat);
  });
});

// A contribution belongs to a group the signed-in member owns, so nobody can pay
// into (or read) another account's circle by guessing its id.
async function ownedCircle(userId: string, circleId: string) {
  const db = getDb();
  const [circle] = await db
    .select()
    .from(circlesTable)
    .where(and(eq(circlesTable.id, circleId), eq(circlesTable.createdBy, userId)))
    .limit(1);
  return circle;
}

async function circleForMember(userId: string, circleId: string) {
  const db = getDb();
  const [circle] = await db
    .select()
    .from(circlesTable)
    .where(eq(circlesTable.id, circleId))
    .limit(1);
  if (!circle) return undefined;
  if (circle.createdBy === userId) return circle;
  const member = circle.membersList?.find(
    (entry) => entry.id === userId && entry.status !== "pending",
  );
  return member ? circle : undefined;
}

function canManageCircle(circle: NonNullable<Awaited<ReturnType<typeof circleForMember>>>, userId: string) {
  return (
    circle.createdBy === userId ||
    circle.membersList?.some(
      (member) =>
        member.id === userId &&
        member.status !== "pending" &&
        (member.role === "admin" || member.role === "co-admin"),
    ) === true
  );
}

// Amounts land in Postgres integer columns, so one huge number would either fail
// the insert or turn every total on screen into nonsense.
const MAX_KES = 10_000_000;

// The same floor the app's loan form gates on, enforced here as well: a rule only the
// phone knows is not a rule, and a stale client would otherwise lend any figure.
const MIN_LOAN = 1_000;

function tooMuchMoney(amount: number): boolean {
  return amount > MAX_KES;
}

router.post("/contributions", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const amount = Number(req.body?.amount);
  const note = String(req.body?.note ?? "Contribution").trim().slice(0, 160) || "Contribution";
  const circleId = String(req.body?.circleId ?? "").slice(0, 80);
  const requestedType = String(req.body?.type ?? "Contribution");
  // A loan disbursement is written by the loan itself, so a hand-typed one is read
  // as an ordinary contribution rather than a payout nobody owes the fund for.
  const type = RECORDABLE_LEDGER_TYPES.includes(requestedType as RecordableLedgerType)
    ? (requestedType as RecordableLedgerType)
    : "Contribution";
  const member = String(req.body?.member ?? "").trim().slice(0, 60) || null;
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ message: "Enter a valid contribution amount." });
    return;
  }
  if (tooMuchMoney(amount)) {
    res.status(400).json({ message: "That amount is too large for a group ledger." });
    return;
  }
  if (!circleId) {
    res.status(400).json({ message: "Choose a group to contribute to." });
    return;
  }
  const circle = await circleForMember(userId, circleId);
  if (!circle) {
    res.status(403).json({ message: "That group belongs to another account." });
    return;
  }
  const isManager = canManageCircle(circle, userId);
  if (!isManager && type !== "Contribution") {
    res.status(403).json({ message: "Only circle admins can record group expenses and adjustments." });
    return;
  }

  const db = getDb();
  const recordedMember = isManager
    ? member
    : ((req as AuthedRequest).user!.name.trim() || "Member");
  await db.insert(contributionsTable).values({
    id: newId("c"),
    circleId,
    userId,
    amount: Math.round(amount),
    date: "Just now",
    note,
    status: "Complete",
    type,
    member: recordedMember,
  });
  res.status(201).json(await publishState(userId));
});

const PERIODS_PER_YEAR: Record<Frequency, number> = {
  Weekly: 52,
  "Bi-weekly": 26,
  Monthly: 12,
};

router.post("/circles", requireAuth, async (req, res) => {
  const authed = req as AuthedRequest;
  const userId = authed.user!.id;
  const name = String(req.body?.name ?? "").trim().slice(0, 60);
  const contribution = Number(req.body?.contribution);
  const frequency = FREQUENCIES.includes(req.body?.frequency) ? (req.body.frequency as Frequency) : "Monthly";
  const joiningFee = Number(req.body?.joiningFee ?? 0);
  const welfare = Number(req.body?.welfare ?? 0);
  const loanInterestPercent = Number(req.body?.loanInterestPercent ?? 5);
  const loanInterestPeriod = asInterestPeriod(req.body?.loanInterestPeriod);
  if (!name) {
    res.status(400).json({ message: "Give your group a name." });
    return;
  }
  if (Number.isFinite(contribution) && tooMuchMoney(contribution)) {
    res.status(400).json({ message: "That contribution is too large for a group ledger." });
    return;
  }
  if (!Number.isFinite(contribution) || contribution <= 0) {
    res.status(400).json({ message: "Set a contribution above zero." });
    return;
  }
  for (const [label, value] of [["Joining fee", joiningFee], ["Welfare", welfare]] as const) {
    if (!Number.isFinite(value) || value < 0 || value > 1_000_000) {
      res.status(400).json({ message: `${label} must be a number between 0 and 1,000,000.` });
      return;
    }
  }
  // A rate is a percentage and it compounds six times over the loan, so an absurd
  // one would turn the repayment total into a number the ledger cannot hold.
  if (!Number.isFinite(loanInterestPercent) || loanInterestPercent < 0 || loanInterestPercent > 100) {
    res.status(400).json({ message: "Loan interest must be a percentage between 0 and 100." });
    return;
  }

  const db = getDb();
  await db.insert(circlesTable).values({
    id: newId("circle"),
    joinCode: newJoinCode(),
    name,
    // The member who opened the group is its first roster entry and its admin.
    membersList: [
      {
        id: userId,
        name: authed.user!.name,
        phone: authed.user!.phone ?? null,
        role: "admin",
        status: "active",
        joinedDate: new Date().toISOString().slice(0, 10),
      },
    ],
    members: 1,
    target: Math.round(contribution) * PERIODS_PER_YEAR[frequency],
    contribution: Math.round(contribution),
    frequency,
    joiningFee: Math.round(joiningFee),
    welfare: Math.round(welfare),
    loanInterestPercent: Math.round(loanInterestPercent),
    loanInterestPeriod,
    createdBy: userId,
    color: "blue",
  });
  res.status(201).json(await publishState(userId));
});

router.post("/circles/join", requireAuth, async (req, res) => {
  const authed = req as AuthedRequest;
  const userId = authed.user!.id;
  const code = String(req.body?.code ?? "").replace(/\s/g, "").toLowerCase();
  if (!/^[a-f0-9]{16}$/.test(code)) {
    res.status(400).json({ message: "Enter the 16-character invite code shared by a circle member." });
    return;
  }

  const result = await getDb().transaction(async (tx) => {
    const [circle] = await tx
      .select()
      .from(circlesTable)
      .where(eq(circlesTable.joinCode, code))
      .for("update")
      .limit(1);
    if (!circle) return { error: "That invite code was not found. Check it and try again.", status: 404 };

    const roster = circle.membersList ?? [];
    const existing = roster.find((member) => member.id === userId);
    if (existing && existing.status !== "pending") return { circleId: circle.id };

    const activeCount = roster.filter((member) => member.status !== "pending").length;
    if (activeCount >= 100) {
      return { error: "This circle is full. Ask the admin before trying again.", status: 409 };
    }

    const joinedDate = new Date().toISOString().slice(0, 10);
    const nextRoster = existing
      ? roster.map((member) =>
          member.id === userId ? { ...member, status: "active" as const, joinedDate } : member,
        )
      : [
          ...roster,
          {
            id: userId,
            name: authed.user!.name,
            phone: authed.user!.phone ?? null,
            role: "member" as const,
            status: "active" as const,
            joinedDate,
          },
        ];

    await tx
      .update(circlesTable)
      .set({ membersList: nextRoster, members: activeCount + 1 })
      .where(eq(circlesTable.id, circle.id));
    return { circleId: circle.id };
  });

  if ("error" in result) {
    res.status(result.status ?? 400).json({ message: result.error });
    return;
  }
  res.json(await publishState(userId));
});

// Closing a group removes its ledger with it, so a member is never left holding a
// group row whose contributions have vanished. The account must still have another
// group afterwards: the app is built around at least one, and an account with none
// would open straight onto a "create a circle" wall it cannot get past.
router.delete("/circles/:id", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const circleId = String(req.params.id);
  const circle = await ownedCircle(userId, circleId);
  if (!circle) {
    res.status(404).json({ message: "That group is not on your record." });
    return;
  }

  const db = getDb();
  const owned = await db
    .select({ id: circlesTable.id })
    .from(circlesTable)
    .where(eq(circlesTable.createdBy, userId));
  if (owned.length <= 1) {
    res.status(409).json({
      message: "Keep at least one circle — create another group before deleting this one.",
    });
    return;
  }

  // No foreign keys hold these rows together, so each child is removed explicitly,
  // in the same request. Loans are matched by circle and owner, so deleting a group
  // can never take another account's loan with it.
  await db.delete(contributionsTable).where(eq(contributionsTable.circleId, circleId));
  await db.delete(loansTable).where(and(eq(loansTable.circleId, circleId), eq(loansTable.userId, userId)));
  await db.delete(circlesTable).where(and(eq(circlesTable.id, circleId), eq(circlesTable.createdBy, userId)));
  res.json(await publishState(userId));
});

router.post("/loans", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const amount = Number(req.body?.amount);
  const purpose = String(req.body?.purpose ?? "Personal need").trim().slice(0, 120) || "Personal need";
  const circleId = String(req.body?.circleId ?? "").slice(0, 80);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ message: "Enter a valid loan amount." });
    return;
  }
  if (tooMuchMoney(amount)) {
    res.status(400).json({ message: `That loan is larger than the app can track (${kes(MAX_KES)} is the most one ledger row holds).` });
    return;
  }
  if (amount < MIN_LOAN) {
    res.status(400).json({ message: `The smallest loan a group can hand over is ${kes(MIN_LOAN)}.` });
    return;
  }

  // A member borrows through a group, and that group sets its own rate.
  const circle = circleId ? await circleForMember(userId, circleId) : undefined;
  if (circleId && !circle) {
    res.status(403).json({ message: "That group belongs to another account." });
    return;
  }
  const principal = Math.round(amount);
  if (circle) {
    // The fund cannot hand over cash it does not hold. This is the same figure the
    // app shows as what it can lend, so the ceiling on screen is the ceiling here.
    const cash = await circleCash(circle.id);
    if (principal > cash) {
      res.status(400).json({
        message: `${circle.name} holds ${kes(cash)}. A loan cannot be larger than the money the group has, or its balance would describe cash nobody can pay out.`,
      });
      return;
    }
  }
  const interestRate = circle?.loanInterestPercent ?? 5;
  const interestPeriod = asInterestPeriod(circle?.loanInterestPeriod);
  const quote = quoteLoan(principal, interestRate, interestPeriod);
  // The term is in months, so the due date is counted in months from the day the money
  // moves. A fixed 183 days is not six of them.
  const due = dueAfterMonths(quote.months);
  const dueDate = formatDay(due);
  const db = getDb();
  const loan = {
    id: newId("loan"),
    userId,
    circleId: circle?.id ?? null,
    principal,
    balance: quote.totalPayable,
    monthlyRepayment: quote.monthlyRepayment,
    totalPayable: quote.totalPayable,
    months: quote.months,
    interestRate,
    interestPeriod,
    dueDate,
    dueOn: isoDay(due),
    purpose,
    // A request is not money the fund has moved. It becomes an active loan — and a
    // disbursement in the ledger — when the group's admin approves it.
    status: "Pending",
  };
  await db.insert(loansTable).values(loan);
  res.status(201).json(await publishState(userId));
});

router.post("/loans/:id/repay", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const amount = Number(req.body?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ message: "Enter a valid repayment amount." });
    return;
  }

  const db = getDb();
  const loanId = String(req.params.id);
  // Only the borrower repays a loan; circle admins can approve it but cannot edit
  // the borrower's repayment balance.
  const [loan] = await db.select().from(loansTable).where(eq(loansTable.id, loanId)).limit(1);
  if (!loan || loan.userId !== userId) {
    res.status(404).json({ message: "That loan is not on your record." });
    return;
  }
  // The screen warns before you get here, but a second device, a stale copy or a
  // double-tap can still send money at a closed loan. Accepting it would leave the
  // group holding cash that no record says anyone paid, so it is refused instead.
  if (loan.balance === 0 || loan.status === "Paid off") {
    res.status(409).json({ message: "This loan is already paid off." });
    return;
  }
  // Rounding an overpayment down to "paid off" would hide the extra from every total:
  // the group would be holding cash no record says anyone handed it.
  if (Math.round(amount) > loan.balance) {
    res.status(400).json({ message: `That is more than the KES ${loan.balance.toLocaleString("en-KE")} still owing on this loan.` });
    return;
  }

  const paid = Math.round(amount);
  const balance = Math.max(loan.balance - paid, 0);
  await db
    .update(loansTable)
    .set({
      balance,
      status: balance === 0 ? "Paid off" : "Active",
    })
    .where(and(eq(loansTable.id, loanId), eq(loansTable.userId, userId)));
  // The same cash the loan's balance dropped by is what the fund received, written
  // once here so the two can never drift apart.
  await recordLoanRepayment(loan, paid);
  res.json(await publishState(userId));
});

router.post("/loans/:id/approve", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const db = getDb();
  const loanId = String(req.params.id);
  // Group requests are decided by an active circle admin; standalone loans remain
  // private to their owner.
  const [loan] = await db
    .select()
    .from(loansTable)
    .where(eq(loansTable.id, loanId))
    .limit(1);
  if (!loan) {
    res.status(404).json({ message: "That loan is not on your record." });
    return;
  }
  if (loan.circleId) {
    const circle = await circleForMember(userId, loan.circleId);
    if (!circle || !canManageCircle(circle, userId)) {
      res.status(403).json({ message: "Only this circle's admin can approve its loan requests." });
      return;
    }
  } else if (loan.userId !== userId) {
    res.status(404).json({ message: "That loan is not on your record." });
    return;
  }
  // Approval decides once. Re-approving a loan already running — or already paid —
  // would answer "Loan approved" while changing nothing, so it is refused instead.
  if (loan.status !== "Pending") {
    res.status(409).json({
      message:
        loan.status === "Paid off"
          ? "This loan is already paid off."
          : "This loan is already approved and running.",
    });
    return;
  }
  // The term runs from the day the money is handed over, not the day it was asked
  // for, so an approval a week late moves the due date with it.
  const due = dueAfterMonths(loan.months);
  if (loan.circleId) {
    // The fund may have spent the money since the request arrived. Approval is when
    // cash actually leaves, so this is where the ceiling is enforced for real.
    const cash = await circleCash(loan.circleId);
    if (loan.principal > cash) {
      res.status(400).json({
        message: `The group holds ${kes(cash)}, which is less than the ${kes(loan.principal)} this loan would hand over. Approving it would put the ledger below the cash anyone can pay out.`,
      });
      return;
    }
  }
  await db
    .update(loansTable)
    .set({ status: "Active", dueDate: formatDay(due), dueOn: isoDay(due) })
    .where(eq(loansTable.id, loanId));
  // Approval is the moment the fund hands the money over, so it is the moment the
  // ledger records it.
  await recordLoanDisbursement({ ...loan, status: "Active" }, "Just now");
  res.json(await publishState(userId));
});

export default router;
