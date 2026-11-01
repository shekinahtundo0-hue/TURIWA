import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { circlesTable, contributionsTable, getDb, loansTable } from "@workspace/db";
import { requireAuth, requireAuthForStream, type AuthedRequest } from "../lib/auth";
import { newId, newJoinCode } from "../lib/ids";
import { asInterestPeriod, LOAN_MONTHS, quoteLoan } from "../lib/loanMath";
import { subscribe } from "../lib/realtime";
import { FREQUENCIES, asFrequency, circleCash, getState, publishState, RECORDABLE_LEDGER_TYPES, type Frequency, type LedgerType, type RecordableLedgerType } from "../lib/store";
import { recordLoanDisbursement, recordLoanRepayment } from "../lib/loanLedger";
import { formatDay, isoDay, kes } from "../lib/money";
import { dueAfterMonths } from "../lib/loanMath";
import { cycleLabel, cycleStart, writtenAt } from "../lib/fines";

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
    (entry) => entry.id === userId && (entry.status ?? "active") === "active",
  );
  return member ? circle : undefined;
}

function canManageCircle(circle: NonNullable<Awaited<ReturnType<typeof circleForMember>>>, userId: string) {
  return (
    circle.createdBy === userId ||
    circle.membersList?.some(
      (member) =>
        member.id === userId &&
        (member.status ?? "active") === "active" &&
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
  const lateFine = Number(req.body?.lateFine ?? 0);
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
  for (const [label, value] of [["Joining fee", joiningFee], ["Welfare", welfare], ["Late fine", lateFine]] as const) {
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
    lateFine: Math.round(lateFine),
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
    if (existing && (existing.status ?? "active") === "active") return { circleId: circle.id };
    if (existing?.status === "removed") {
      return { error: "This account was removed from the circle. Ask an admin to restore membership.", status: 403 };
    }

    const activeCount = roster.filter((member) => (member.status ?? "active") === "active").length;
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

router.delete("/circles/:id/members/:memberId", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const circleId = String(req.params.id);
  const memberId = String(req.params.memberId);
  const result = await getDb().transaction(async (tx) => {
    const [circle] = await tx
      .select()
      .from(circlesTable)
      .where(eq(circlesTable.id, circleId))
      .for("update")
      .limit(1);
    if (!circle) return { error: "That circle could not be found.", status: 404 as const };
    if (!canManageCircle(circle, userId)) {
      return { error: "Only an active circle admin can remove members.", status: 403 as const };
    }
    const roster = circle.membersList ?? [];
    const target = roster.find((member) => member.id === memberId && (member.status ?? "active") === "active");
    if (!target) return { error: "That person is not an active member of this circle.", status: 404 as const };

    const isPrimaryAdmin = target.id === circle.createdBy || target.role === "admin";
    if (isPrimaryAdmin && target.id !== userId) {
      return { error: "The primary admin cannot be removed by another member.", status: 409 as const };
    }
    if (target.role === "co-admin" && userId !== circle.createdBy) {
      return { error: "Only the primary admin can remove another circle admin.", status: 403 as const };
    }

    let nextCreatedBy = circle.createdBy;
    let promotedId: string | null = null;
    if (target.id === circle.createdBy) {
      const replacement = roster.find(
        (member) => member.id !== target.id && (member.status ?? "active") === "active" && member.role === "co-admin",
      );
      if (!replacement) {
        return { error: "Assign an active co-admin before leaving this circle so it keeps an administrator.", status: 409 as const };
      }
      promotedId = replacement.id;
      nextCreatedBy = replacement.id;
    }

    const now = new Date().toISOString();
    const nextRoster = roster.map((member) => {
      if (member.id === target.id) {
        return { ...member, status: "removed" as const, removedAt: now, removedBy: userId };
      }
      if (member.id === promotedId) return { ...member, role: "admin" as const };
      return member;
    });
    const members = nextRoster.filter((member) => (member.status ?? "active") === "active").length;
    const remainingAdmins = nextRoster.filter(
      (member) => (member.status ?? "active") === "active" &&
        (member.id === nextCreatedBy || member.role === "admin" || member.role === "co-admin"),
    );
    if (remainingAdmins.length === 0) {
      return { error: "A circle must keep at least one active admin.", status: 409 as const };
    }
    await tx
      .update(circlesTable)
      .set({ membersList: nextRoster, members, createdBy: nextCreatedBy })
      .where(eq(circlesTable.id, circleId));
    return { ok: true as const, removedName: target.name };
  });
  if ("error" in result) {
    res.status(result.status ?? 400).json({ message: result.error });
    return;
  }
  res.json(await publishState(userId));
});

// The admin decides what a missed contribution costs. Saving the rule charges
// nobody: it only gives the circle a fine the admin can apply by hand.
router.patch("/circles/:id", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const circleId = String(req.params.id);
  const circle = await ownedCircle(userId, circleId);
  if (!circle) {
    res.status(404).json({ message: "That group is not on your record." });
    return;
  }
  const lateFine = Number(req.body?.lateFine);
  if (!Number.isInteger(lateFine) || lateFine < 0 || lateFine > 1_000_000) {
    res.status(400).json({ message: "The late fine must be a whole amount between 0 and 1,000,000." });
    return;
  }
  await getDb()
    .update(circlesTable)
    .set({ lateFine })
    .where(and(eq(circlesTable.id, circleId), eq(circlesTable.createdBy, userId)));
  res.json(await publishState(userId));
});

// One fine per member per cycle, at the amount the admin set. The row is written as
// money received, because the admin records it when the member pays it — the app does
// not invent a debt, and it never charges anyone without the admin asking.
router.post("/circles/:id/fines", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const circle = await ownedCircle(userId, String(req.params.id));
  if (!circle) {
    res.status(404).json({ message: "That group is not on your record." });
    return;
  }
  const memberId = String(req.body?.memberId ?? "");
  const member = (circle.membersList ?? []).find((entry) => entry.id === memberId && (entry.status ?? "active") === "active");
  if (!member) {
    res.status(404).json({ message: "That member is not on this group's roster." });
    return;
  }
  const lateFine = circle.lateFine ?? 0;
  if (lateFine <= 0) {
    res.status(409).json({ message: "Set a late fine for this group before charging one." });
    return;
  }
  const frequency = asFrequency(circle.frequency);
  const cycle = cycleLabel(frequency);

  const db = getDb();
  const rows = await db.select().from(contributionsTable).where(eq(contributionsTable.circleId, circle.id));
  let firstRecord: Date | null = null;
  for (const row of rows) {
    const at = writtenAt(row.createdAt);
    if (at && (!firstRecord || at < firstRecord)) firstRecord = at;
  }
  const start = cycleStart(frequency, firstRecord);
  const named = member.name.trim().toLowerCase();
  const aboutMember = (row: { member: string | null; userId: string | null }) =>
    (row.member ?? "").trim().toLowerCase() === named || row.userId === member.id;
  const thisCycle = rows.filter((row) => {
    const at = writtenAt(row.createdAt);
    return at !== null && at >= start && aboutMember(row);
  });
  if (thisCycle.some((row) => row.type === "Fine")) {
    res.status(409).json({ message: `${member.name} has already been fined for ${cycle}.` });
    return;
  }
  const paid = thisCycle
    .filter((row) => row.type === "Contribution" && row.status === "Complete")
    .reduce((sum, row) => sum + row.amount, 0);
  if (paid >= circle.contribution) {
    res.status(409).json({ message: `${member.name} has paid the ${kes(circle.contribution)} contribution for ${cycle}.` });
    return;
  }

  await db.insert(contributionsTable).values({
    id: newId("c"),
    circleId: circle.id,
    userId: member.id,
    amount: lateFine,
    date: formatDay(new Date()),
    note: `Late contribution fine — ${cycle}`,
    status: "Complete",
    type: "Fine",
    member: member.name,
  });
  res.status(201).json(await publishState(userId));
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
  const purpose = String(req.body?.purpose ?? "").trim().slice(0, 120);
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

  if (!purpose) {
    res.status(400).json({ message: "Explain what the loan is for." });
    return;
  }
  if (!circleId) {
    res.status(400).json({ message: "Choose a circle to apply through." });
    return;
  }
  const preferredMonths = Number(req.body?.preferredMonths ?? LOAN_MONTHS);
  if (![3, 6, 9, 12].includes(preferredMonths)) {
    res.status(400).json({ message: "Choose a repayment period of 3, 6, 9, or 12 months." });
    return;
  }
  // Locking the circle serializes applications from one member and lets the duplicate
  // pending check below reliably stop a fast double submit on another device too.
  const db = getDb();
  const result = await db.transaction(async (tx) => {
    const [circle] = await tx
      .select()
      .from(circlesTable)
      .where(eq(circlesTable.id, circleId))
      .for("update")
      .limit(1);
    if (!circle) return { error: "That circle could not be found.", status: 404 as const };
    if (circle.createdBy !== userId && !circle.membersList?.some(
      (member) => member.id === userId && (member.status ?? "active") === "active",
    )) {
      return { error: "Join this circle before applying for one of its loans.", status: 403 as const };
    }
    const [existing] = await tx
      .select({ id: loansTable.id })
      .from(loansTable)
      .where(and(
        eq(loansTable.userId, userId),
        eq(loansTable.circleId, circleId),
        eq(loansTable.status, "Pending"),
      ))
      .limit(1);
    if (existing) return { error: "You already have a pending application in this circle.", status: 409 as const };

    const principal = Math.round(amount);
    const cash = await circleCash(circle.id);
    if (principal > cash) {
      return {
        error: `${circle.name} holds ${kes(cash)}. A loan cannot be larger than the money the group has.`,
        status: 400 as const,
      };
    }
    const interestRate = circle.loanInterestPercent ?? 5;
    const interestPeriod = asInterestPeriod(circle.loanInterestPeriod);
    const quote = quoteLoan(principal, interestRate, interestPeriod, preferredMonths);
    const due = dueAfterMonths(quote.months);
    await tx.insert(loansTable).values({
      id: newId("loan"),
      userId,
      circleId: circle.id,
      principal,
      requestedPrincipal: principal,
      balance: quote.totalPayable,
      monthlyRepayment: quote.monthlyRepayment,
      totalPayable: quote.totalPayable,
      months: quote.months,
      requestedMonths: quote.months,
      interestRate,
      interestPeriod,
      dueDate: formatDay(due),
      dueOn: isoDay(due),
      purpose,
      status: "Pending",
    });
    return { ok: true as const };
  });
  if ("error" in result) {
    res.status(result.status ?? 400).json({ message: result.error });
    return;
  }
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
  // Only an independent, active admin of the applicant's group may decide a request.
  const [loan] = await db
    .select()
    .from(loansTable)
    .where(eq(loansTable.id, loanId))
    .limit(1);
  if (!loan) {
    res.status(404).json({ message: "That loan is not on your record." });
    return;
  }
  if (!loan.circleId) {
    res.status(403).json({ message: "A loan request must belong to a circle with an independent admin reviewer." });
    return;
  }
  const circle = await circleForMember(userId, loan.circleId);
  if (!circle || !canManageCircle(circle, userId)) {
    res.status(403).json({ message: "Only this circle's admin can approve its loan requests." });
    return;
  }
  if (loan.userId === userId) {
    res.status(403).json({ message: "You cannot approve your own loan application. Another circle admin must review it." });
    return;
  }
  // Approval decides once. Re-approving a loan already running — or already paid —
  // would answer "Loan approved" while changing nothing, so it is refused instead.
  if (loan.status !== "Pending") {
    res.status(409).json({
      message:
        loan.status === "Paid off"
          ? "This loan is already paid off."
          : loan.status === "Rejected"
            ? "This loan request was already rejected."
            : "This loan is already approved and running.",
    });
    return;
  }
  const amount = Number(req.body?.amount ?? loan.requestedPrincipal ?? loan.principal);
  const months = Number(req.body?.months ?? loan.requestedMonths ?? loan.months);
  const interestRate = Number(req.body?.interestRate ?? loan.interestRate);
  if (!Number.isInteger(amount) || amount < MIN_LOAN || amount > MAX_KES) {
    res.status(400).json({ message: `Approved amount must be a whole amount between ${kes(MIN_LOAN)} and ${kes(MAX_KES)}.` });
    return;
  }
  if (![3, 6, 9, 12].includes(months)) {
    res.status(400).json({ message: "Choose an approved repayment period of 3, 6, 9, or 12 months." });
    return;
  }
  if (!Number.isInteger(interestRate) || interestRate < 0 || interestRate > 100) {
    res.status(400).json({ message: "Interest must be a whole percentage between 0 and 100." });
    return;
  }
  const cash = await circleCash(circle.id);
  if (amount > cash) {
    res.status(400).json({
      message: `The group holds ${kes(cash)}, which is less than the ${kes(amount)} this loan would hand over.`,
    });
    return;
  }
  const quote = quoteLoan(amount, interestRate, asInterestPeriod(loan.interestPeriod), months);
  // The term runs from the day the money is handed over, not the day it was applied.
  const due = dueAfterMonths(quote.months);
  const changed = await db
    .update(loansTable)
    .set({
      principal: amount,
      balance: quote.totalPayable,
      monthlyRepayment: quote.monthlyRepayment,
      totalPayable: quote.totalPayable,
      months: quote.months,
      interestRate,
      status: "Active",
      dueDate: formatDay(due),
      dueOn: isoDay(due),
      reviewedBy: userId,
      reviewedAt: new Date(),
      rejectionReason: null,
    })
    .where(and(eq(loansTable.id, loanId), eq(loansTable.status, "Pending")))
    .returning({ id: loansTable.id });
  if (changed.length === 0) {
    res.status(409).json({ message: "This loan request has already been decided." });
    return;
  }
  // Approval is the moment the fund hands the money over, so it is the moment the
  // ledger records it.
  await recordLoanDisbursement({
    ...loan,
    principal: amount,
    balance: quote.totalPayable,
    monthlyRepayment: quote.monthlyRepayment,
    totalPayable: quote.totalPayable,
    months: quote.months,
    interestRate,
    dueDate: formatDay(due),
    dueOn: isoDay(due),
    reviewedBy: userId,
    reviewedAt: new Date(),
    rejectionReason: null,
    status: "Active",
  }, "Just now");
  res.json(await publishState(userId));
});

router.post("/loans/:id/reject", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const db = getDb();
  const loanId = String(req.params.id);
  const reason = String(req.body?.reason ?? "").trim().slice(0, 300);
  if (reason.length < 5) {
    res.status(400).json({ message: "Add a rejection reason of at least 5 characters." });
    return;
  }
  const [loan] = await db.select().from(loansTable).where(eq(loansTable.id, loanId)).limit(1);
  if (!loan) {
    res.status(404).json({ message: "That loan request could not be found." });
    return;
  }
  if (!loan.circleId) {
    res.status(403).json({ message: "Only a circle admin can reject a group loan request." });
    return;
  }
  const circle = await circleForMember(userId, loan.circleId);
  if (!circle || !canManageCircle(circle, userId)) {
    res.status(403).json({ message: "Only this circle's admin can reject its loan requests." });
    return;
  }
  if (loan.userId === userId) {
    res.status(403).json({ message: "You cannot reject your own loan application. Another circle admin must review it." });
    return;
  }
  if (loan.status !== "Pending") {
    res.status(409).json({ message: "Only a pending loan request can be rejected." });
    return;
  }
  const changed = await db
    .update(loansTable)
    .set({ status: "Rejected", reviewedBy: userId, reviewedAt: new Date(), rejectionReason: reason })
    .where(and(eq(loansTable.id, loanId), eq(loansTable.status, "Pending")))
    .returning({ id: loansTable.id });
  if (changed.length === 0) {
    res.status(409).json({ message: "This loan request has already been decided." });
    return;
  }
  res.json(await publishState(userId));
});

export default router;
