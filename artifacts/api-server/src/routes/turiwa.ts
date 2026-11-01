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
import { notify, notifyManagers, notifyMembers } from "../lib/notify";

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
// Loan totals share the Postgres INTEGER range even when the requested principal
// is within the lower user-facing limit.
const MAX_LEDGER_INTEGER = 2_147_483_647;

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
  const entryId = newId("c");
  await db.insert(contributionsTable).values({
    id: entryId,
    circleId,
    userId,
    amount: Math.round(amount),
    date: "Just now",
    note,
    status: "Complete",
    type,
    member: recordedMember,
  });
  const actor = (req as AuthedRequest).user!.name;
  const who = recordedMember ?? actor;
  if (type === "Contribution" || type === "Repayment") {
    await notifyManagers(circle, {
      exceptUserId: userId,
      type: "contribution",
      title: `${who} paid into ${circle.name}`,
      body: `${kes(Math.round(amount))} recorded as a ${type === "Repayment" ? "loan repayment" : "contribution"}.`,
      link: "/activity",
      entityId: entryId,
    });
  } else {
    await notifyMembers(circle, {
      exceptUserId: userId,
      type: "announcement",
      title: `${circle.name}: ${type.toLowerCase()} recorded`,
      body: `${kes(Math.round(amount))} — ${note}.`,
      link: "/activity",
      entityId: entryId,
    });
  }
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
    if (existing && (existing.status ?? "active") === "active") return { circleId: circle.id, joined: false as const };
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
    return { circleId: circle.id, joined: true as const, circle: { ...circle, membersList: nextRoster } };
  });

  if ("error" in result) {
    res.status(result.status ?? 400).json({ message: result.error });
    return;
  }
  if ("joined" in result && result.joined && result.circle) {
    await notifyManagers(result.circle, {
      exceptUserId: userId,
      type: "member_joined",
      title: `${authed.user!.name} joined ${result.circle.name}`,
      body: `${authed.user!.name} accepted the invite and is now an active member.`,
      link: "/circles",
      entityId: userId,
      dedupeKey: `member-joined:${result.circle.id}:${userId}`,
    });
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

    if (target.id === circle.createdBy) {
      return { error: "Transfer Primary Admin ownership first, then leave the circle.", status: 409 as const };
    }

    const now = new Date().toISOString();
    const nextRoster = roster.map((member) => {
      if (member.id === target.id) {
        return { ...member, status: "removed" as const, removedAt: now, removedBy: userId };
      }
      return member;
    });
    const members = nextRoster.filter((member) => (member.status ?? "active") === "active").length;
    const remainingAdmins = nextRoster.filter(
      (member) => (member.status ?? "active") === "active" &&
        (member.id === circle.createdBy || member.role === "admin" || member.role === "co-admin"),
    );
    if (remainingAdmins.length === 0) {
      return { error: "A circle must keep at least one active admin.", status: 409 as const };
    }
    await tx
      .update(circlesTable)
      .set({ membersList: nextRoster, members })
      .where(eq(circlesTable.id, circleId));
    return {
      ok: true as const,
      removedName: target.name,
      removedId: target.id,
      circle: { ...circle, membersList: nextRoster },
    };
  });
  if ("error" in result) {
    res.status(result.status ?? 400).json({ message: result.error });
    return;
  }
  await notify({
    userId: result.removedId,
    circleId: result.circle.id,
    type: "member_removed",
    title: `You were removed from ${result.circle.name}`,
    body: "Your membership in this circle was ended by an admin. Your recorded transactions stay with the circle's ledger.",
    link: "/circles",
    entityId: result.circle.id,
    dedupeKey: `member-removed:${result.circle.id}:${result.removedId}`,
  });
  await notifyManagers(result.circle, {
    exceptUserId: userId,
    type: "member_removed",
    title: `${result.removedName} was removed from ${result.circle.name}`,
    body: `${userId === result.removedId ? "The member left the circle." : "An admin ended this membership."}`,
    link: "/circles",
    entityId: result.removedId,
  });
  res.json(await publishState(userId));
});

router.patch("/circles/:id/members/:memberId/role", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const circleId = String(req.params.id);
  const memberId = String(req.params.memberId);
  const role = String(req.body?.role);
  if (role !== "member" && role !== "co-admin") {
    res.status(400).json({ message: "Choose Member or Co-Admin." });
    return;
  }
  const result = await getDb().transaction(async (tx) => {
    const [circle] = await tx.select().from(circlesTable).where(eq(circlesTable.id, circleId)).for("update").limit(1);
    if (!circle) return { error: "That circle could not be found.", status: 404 as const };
    if (!canManageCircle(circle, userId)) return { error: "Only an active circle admin can manage roles.", status: 403 as const };
    const roster = circle.membersList ?? [];
    const target = roster.find((member) => member.id === memberId && (member.status ?? "active") === "active");
    if (!target) return { error: "That person is not an active member of this circle.", status: 404 as const };
    if (target.id === circle.createdBy || target.role === "admin") {
      return { error: "The Primary Admin's role can only change through a Primary Admin transfer.", status: 409 as const };
    }
    const actor = roster.find((member) => member.id === userId && (member.status ?? "active") === "active");
    const isPrimaryAdmin = circle.createdBy === userId;
    const isCoAdmin = actor?.role === "co-admin";
    if (!isPrimaryAdmin && !isCoAdmin) return { error: "Only an active circle admin can manage roles.", status: 403 as const };
    if (isCoAdmin && target.role === "co-admin" && (role !== "member" || memberId === userId)) {
      return { error: "Co-Admins can only demote another Co-Admin, not themselves.", status: 403 as const };
    }
    if (role === "co-admin" && target.role !== "co-admin") {
      const count = roster.filter((member) => member.id !== circle.createdBy && member.role === "co-admin" && (member.status ?? "active") === "active").length;
      if (count >= 2) return { error: "A circle can have at most two Co-Admins.", status: 409 as const };
    }
    if (target.role === role) return { error: `This person is already a ${role === "member" ? "Member" : "Co-Admin"}.`, status: 409 as const };
    const nextRoster = roster.map((member) => member.id === memberId ? { ...member, role: role as "member" | "co-admin" } : member);
    await tx.update(circlesTable).set({ membersList: nextRoster }).where(eq(circlesTable.id, circleId));
    return { ok: true as const, targetName: target.name, targetId: target.id, circleName: circle.name, nextRole: role };
  });
  if ("error" in result) {
    res.status(result.status ?? 400).json({ message: result.error });
    return;
  }
  await notify({
    userId: result.targetId,
    circleId: circleId,
    type: "role_changed",
    title: `Your role in ${result.circleName} changed`,
    body: result.nextRole === "co-admin"
      ? "You are now a Co-Admin. You can manage the circle's records and settings."
      : "You are now a Member. Circle administration has ended.",
    link: "/circles",
    entityId: circleId,
    dedupeKey: `role-changed:${circleId}:${result.targetId}:${result.nextRole}`,
  });
  res.json(await publishState(userId));
});

router.post("/circles/:id/transfer-primary", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const circleId = String(req.params.id);
  const memberId = String(req.body?.memberId ?? "");
  const result = await getDb().transaction(async (tx) => {
    const [circle] = await tx.select().from(circlesTable).where(eq(circlesTable.id, circleId)).for("update").limit(1);
    if (!circle) return { error: "That circle could not be found.", status: 404 as const };
    if (circle.createdBy !== userId) return { error: "Only the Primary Admin can transfer circle authority.", status: 403 as const };
    if (!memberId || memberId === userId) return { error: "Choose another active circle member.", status: 400 as const };
    const roster = circle.membersList ?? [];
    const target = roster.find((member) => member.id === memberId && (member.status ?? "active") === "active");
    if (!target) return { error: "Choose an active member of this circle.", status: 404 as const };
    const nextRoster = roster.map((member) => {
      if (member.id === memberId) return { ...member, role: "admin" as const };
      if (member.id === userId || member.role === "admin") return { ...member, role: "member" as const };
      return member;
    });
    await tx.update(circlesTable).set({ membersList: nextRoster, createdBy: memberId }).where(eq(circlesTable.id, circleId));
    return { ok: true as const, circleName: circle.name };
  });
  if ("error" in result) {
    res.status(result.status ?? 400).json({ message: result.error });
    return;
  }
  await notify({
    userId: memberId,
    circleId,
    type: "role_changed",
    title: `You are now Primary Admin of ${result.circleName}`,
    body: "Circle authority was transferred to you. You can manage members, records and settings.",
    link: "/circles",
    entityId: circleId,
    dedupeKey: `primary-transfer:${circleId}:${memberId}:${Date.now()}`,
  });
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
  await notify({
    userId: member.id,
    circleId: circle.id,
    type: "fine",
    title: `${circle.name}: late contribution fine`,
    body: `${kes(lateFine)} was recorded against you for ${cycle}. The group's fine rule is ${kes(lateFine)} for a missed contribution.`,
    link: "/activity",
    entityId: circle.id,
    dedupeKey: `fine:${circle.id}:${member.id}:${isoDay(start)}`,
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
  const applicationKey = String(req.body?.applicationKey ?? "").trim();
  if (applicationKey && !/^[A-Za-z0-9._:-]{8,100}$/.test(applicationKey)) {
    res.status(400).json({ message: "That application could not be identified. Please try again." });
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
    if (applicationKey) {
      const [sameRequest] = await tx.select({ id: loansTable.id, userId: loansTable.userId, circleId: loansTable.circleId })
        .from(loansTable).where(eq(loansTable.applicationKey, applicationKey)).limit(1);
      if (sameRequest) {
        if (sameRequest.userId === userId && sameRequest.circleId === circleId) return { ok: true as const };
        return { error: "That application reference has already been used.", status: 409 as const };
      }
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
    const cash = await circleCash(circle.id, tx);
    if (principal > cash) {
      return {
        error: `${circle.name} holds ${kes(cash)}. A loan cannot be larger than the money the group has.`,
        status: 400 as const,
      };
    }
    const interestRate = circle.loanInterestPercent ?? 5;
    const interestPeriod = asInterestPeriod(circle.loanInterestPeriod);
    const quote = quoteLoan(principal, interestRate, interestPeriod, preferredMonths);
    if (quote.totalPayable > MAX_LEDGER_INTEGER) {
      return { error: "Those terms exceed the amount the ledger can safely record. Reduce the loan amount, interest rate, or repayment period.", status: 400 as const };
    }
    const due = dueAfterMonths(quote.months);
    // A member who manages this circle on its own roster does not have to find a second
    // signature for their own request — the circle already trusts them to decide on
    // other people's. The answer comes from the circle row this transaction locked,
    // never from a role, status or approval the caller typed into the body.
    const decidesAlone = canManageCircle(circle, userId);
    const reviewedAt = new Date();
    const [createdLoan] = await tx.insert(loansTable).values({
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
      // Someone who is not a manager of the circle always waits for a second person to
      // approve them; their request moves no money until that decision is recorded.
      status: decidesAlone ? "Active" : "Pending",
      reviewedBy: decidesAlone ? userId : null,
      reviewedAt: decidesAlone ? reviewedAt : null,
      applicationKey: applicationKey || null,
    }).onConflictDoNothing().returning();
    if (!createdLoan) {
      const [existingKey] = applicationKey
        ? await tx.select({ userId: loansTable.userId, circleId: loansTable.circleId }).from(loansTable).where(eq(loansTable.applicationKey, applicationKey)).limit(1)
        : [];
      if (existingKey?.userId === userId && existingKey.circleId === circleId) return { ok: true as const };
      return { error: "That application reference has already been used.", status: 409 as const };
    }
    // An approved request and the cash it handed over are one decision: both are written
    // inside this transaction, so the loan can never be Active without its payout, and
    // the payout id is built from the loan id, so it cannot be written twice.
    if (decidesAlone) await recordLoanDisbursement(createdLoan, "Just now", tx);
    return {
      ok: true as const,
      loanId: createdLoan.id,
      loanStatus: createdLoan.status,
      purpose,
      principal,
      totalPayable: quote.totalPayable,
      months: quote.months,
      interestRate,
      interestPeriod,
      circle,
    };
  });
  if ("error" in result) {
    res.status(result.status ?? 400).json({ message: result.error });
    return;
  }
  // A retried request with the same application key may resolve to the existing
  // application. Its successful no-op response deliberately has no loan fields.
  if (!("loanId" in result)) {
    res.status(200).json(await publishState(userId));
    return;
  }
  if (result.loanStatus === "Pending" && result.circle && result.loanId && result.principal !== undefined) {
    await notifyManagers(result.circle, {
      exceptUserId: userId,
      type: "loan_application",
      title: `New loan application in ${result.circle.name}`,
      body: `${(req as AuthedRequest).user!.name} asked for ${kes(result.principal)} for "${result.purpose}". No money has moved yet.`,
      link: "/loans",
      entityId: result.loanId,
      dedupeKey: `loan-application:${result.loanId}`,
    });
  }
  if (result.loanStatus === "Active" && result.circle && result.loanId) {
    await notify({
      userId,
      circleId: result.circle.id,
      type: "loan_approved",
      title: `Loan approved by ${result.circle.name}`,
      body: `${kes(result.principal ?? 0)} for "${result.purpose}" was paid out on the terms you applied with: ${result.months} months at ${result.interestRate}% ${result.interestPeriod === "Year" ? "a year" : "a month"}. ${kes(result.totalPayable ?? 0)} is repayable in total.`,
      link: "/loans",
      entityId: result.loanId,
      dedupeKey: `loan-approved:${result.loanId}`,
    });
  }
  res.status(201).json(await publishState(userId));
});

router.post("/loans/:id/repay", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const amount = Number(req.body?.amount);
  if (!Number.isInteger(amount) || amount <= 0) {
    res.status(400).json({ message: "Enter a whole repayment amount above zero." });
    return;
  }

  const db = getDb();
  const loanId = String(req.params.id);
  const requestKey = String(req.body?.idempotencyKey ?? "").trim();
  if (requestKey && !/^[A-Za-z0-9._:-]{8,100}$/.test(requestKey)) {
    res.status(400).json({ message: "That repayment reference is invalid. Please try again." });
    return;
  }
  const repaymentEntryId = requestKey ? `loan-repay-${loanId}-${requestKey}` : newId("loan-repay");
  // Only the borrower repays a loan; circle admins can approve it but cannot edit
  // the borrower's repayment balance.
  const result = await db.transaction(async (tx) => {
    const [loan] = await tx.select().from(loansTable).where(eq(loansTable.id, loanId)).for("update").limit(1);
    if (!loan || loan.userId !== userId) return { error: "That loan is not on your record.", status: 404 as const };
    const [existingPayment] = await tx.select().from(contributionsTable).where(eq(contributionsTable.id, repaymentEntryId)).limit(1);
    if (existingPayment) {
      if (existingPayment.loanId === loan.id && existingPayment.userId === userId && existingPayment.amount === amount && existingPayment.type === "Repayment") {
        return { ok: true as const, duplicate: true as const };
      }
      return { error: "That repayment reference was already used for another payment.", status: 409 as const };
    }
    if (loan.status !== "Active") return { error: "Only an approved, active loan can receive repayments.", status: 409 as const };
    if (loan.balance === 0) return { error: "This loan is already paid off.", status: 409 as const };
    const paid = Math.round(amount);
    if (paid > loan.balance) return { error: `That is more than the KES ${loan.balance.toLocaleString("en-KE")} still owing on this loan.`, status: 400 as const };
    const balance = loan.balance - paid;
    await tx.update(loansTable).set({ balance, status: balance === 0 ? "Paid off" : "Active" })
      .where(and(eq(loansTable.id, loanId), eq(loansTable.userId, userId)));
    await recordLoanRepayment(loan, paid, tx, repaymentEntryId);
    const [circle] = loan.circleId
      ? await tx.select().from(circlesTable).where(eq(circlesTable.id, loan.circleId)).limit(1)
      : [];
    return { ok: true as const, duplicate: false as const, loan, paid, balance, circle: circle ?? null };
  });
  if ("error" in result) {
    res.status(result.status ?? 400).json({ message: result.error });
    return;
  }
  if (result.duplicate) {
    res.json(await publishState(userId));
    return;
  }
  if (result.circle) {
    await notifyManagers(result.circle, {
      exceptUserId: userId,
      type: "loan_repayment",
      title: `Repayment received in ${result.circle.name}`,
      body: `${kes(result.paid)} came back on "${result.loan.purpose}". ${result.balance === 0 ? "The loan is fully repaid." : `${kes(result.balance)} still outstanding.`}`,
      link: "/loans",
      entityId: result.loan.id,
      dedupeKey: `repayment:${result.loan.id}:${result.loan.balance - result.paid}`,
    });
  }
  await notify({
    userId,
    circleId: result.loan.circleId,
    type: "loan_repayment",
    title: "Repayment recorded",
    body: `${kes(result.paid)} was recorded against "${result.loan.purpose}". ${result.balance === 0 ? "The loan is fully repaid." : `${kes(result.balance)} remains outstanding.`}`,
    link: "/loans",
    entityId: result.loan.id,
    dedupeKey: `repayment-receipt:${result.loan.id}:${result.loan.balance - result.paid}`,
  });
  res.json(await publishState(userId));
});

router.post("/loans/:id/approve", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const db = getDb();
  const loanId = String(req.params.id);
  const [requestedTerms] = await db.select({
    requestedPrincipal: loansTable.requestedPrincipal,
    requestedMonths: loansTable.requestedMonths,
    interestRate: loansTable.interestRate,
  }).from(loansTable).where(eq(loansTable.id, loanId)).limit(1);
  const amount = Number(req.body?.amount ?? requestedTerms?.requestedPrincipal);
  const months = Number(req.body?.months ?? requestedTerms?.requestedMonths);
  const interestRate = Number(req.body?.interestRate ?? requestedTerms?.interestRate);
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
  const result = await db.transaction(async (tx) => {
    const loanIdRow = await tx.select({ circleId: loansTable.circleId }).from(loansTable).where(eq(loansTable.id, loanId)).limit(1);
    if (!loanIdRow[0]) return { error: "That loan could not be found.", status: 404 as const };
    if (!loanIdRow[0].circleId) return { error: "A loan request must belong to a circle with an independent admin reviewer.", status: 403 as const };
    const [circle] = await tx.select().from(circlesTable).where(eq(circlesTable.id, loanIdRow[0].circleId)).for("update").limit(1);
    if (!circle || !canManageCircle(circle, userId)) return { error: "Only this circle's admin can approve its loan requests.", status: 403 as const };
    const [loan] = await tx.select().from(loansTable).where(eq(loansTable.id, loanId)).for("update").limit(1);
    if (!loan) return { error: "That loan could not be found.", status: 404 as const };
    if (loan.userId === userId) return { error: "You cannot review your own loan application.", status: 403 as const };
    if (loan.status !== "Pending") return { error: "This loan request has already been decided.", status: 409 as const };
    const cash = await circleCash(circle.id, tx);
    if (amount > cash) return { error: `The group holds ${kes(cash)}, which is less than the ${kes(amount)} this loan would hand over.`, status: 400 as const };
    const quote = quoteLoan(amount, interestRate, asInterestPeriod(loan.interestPeriod), months);
    if (quote.totalPayable > MAX_LEDGER_INTEGER) {
      return { error: "Those approved terms exceed the amount the ledger can safely record. Reduce the amount, interest rate, or term.", status: 400 as const };
    }
    const due = dueAfterMonths(quote.months);
    const reviewedAt = new Date();
    const [approved] = await tx.update(loansTable).set({
      principal: amount, balance: quote.totalPayable, monthlyRepayment: quote.monthlyRepayment,
      totalPayable: quote.totalPayable, months: quote.months, interestRate, status: "Active",
      dueDate: formatDay(due), dueOn: isoDay(due), reviewedBy: userId, reviewedAt, rejectionReason: null,
    }).where(and(eq(loansTable.id, loanId), eq(loansTable.status, "Pending"))).returning();
    if (!approved) return { error: "This loan request has already been decided.", status: 409 as const };
    await recordLoanDisbursement(approved, "Just now", tx);
    return { ok: true as const, approved, circle };
  });
  if ("error" in result) {
    res.status(result.status ?? 400).json({ message: result.error });
    return;
  }
  if (result.approved.userId) {
    await notify({
      userId: result.approved.userId,
      circleId: result.circle.id,
      type: "loan_approved",
      title: `Loan approved by ${result.circle.name}`,
      body: `${kes(result.approved.principal)} for "${result.approved.purpose}" was approved over ${result.approved.months} months at ${result.approved.interestRate}% ${result.approved.interestPeriod === "Year" ? "a year" : "a month"}. ${kes(result.approved.balance)} is repayable in total.`,
      link: "/loans",
      entityId: result.approved.id,
      dedupeKey: `loan-approved:${result.approved.id}`,
    });
  }
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
  const result = await db.transaction(async (tx) => {
    const [loanRef] = await tx.select({ circleId: loansTable.circleId }).from(loansTable).where(eq(loansTable.id, loanId)).limit(1);
    if (!loanRef) return { error: "That loan request could not be found.", status: 404 as const };
    if (!loanRef.circleId) return { error: "Only a circle admin can reject a group loan request.", status: 403 as const };
    const [circle] = await tx.select().from(circlesTable).where(eq(circlesTable.id, loanRef.circleId)).for("update").limit(1);
    if (!circle || !canManageCircle(circle, userId)) return { error: "Only this circle's admin can reject its loan requests.", status: 403 as const };
    const [loan] = await tx.select().from(loansTable).where(eq(loansTable.id, loanId)).for("update").limit(1);
    if (!loan) return { error: "That loan request could not be found.", status: 404 as const };
    if (loan.userId === userId) return { error: "You cannot reject your own loan application.", status: 403 as const };
    if (loan.status !== "Pending") return { error: "Only a pending loan request can be rejected.", status: 409 as const };
    await tx.update(loansTable).set({ status: "Rejected", reviewedBy: userId, reviewedAt: new Date(), rejectionReason: reason })
      .where(and(eq(loansTable.id, loanId), eq(loansTable.status, "Pending")));
    return { ok: true as const, rejected: loan, circle };
  });
  if ("error" in result) {
    res.status(result.status ?? 400).json({ message: result.error });
    return;
  }
  if (result.rejected.userId) {
    await notify({
      userId: result.rejected.userId,
      circleId: result.circle.id,
      type: "loan_rejected",
      title: `Loan request declined by ${result.circle.name}`,
      body: `"${result.rejected.purpose}" was not approved. Reason: ${reason}. No money was paid out.`,
      link: "/loans",
      entityId: result.rejected.id,
      dedupeKey: `loan-rejected:${result.rejected.id}`,
    });
  }
  res.json(await publishState(userId));
});

export default router;
