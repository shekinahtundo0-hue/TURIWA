import { Router, type IRouter, type Request } from "express";
import { and, eq, desc } from "drizzle-orm";
import { circlesTable, contributionsTable, getDb, loansTable, savingsGoalsTable, goalEntriesTable, meetingsTable, attendanceTable, proposalsTable, proposalOptionsTable, proposalVotesTable } from "@workspace/db";
import { createHash } from "node:crypto";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { newId } from "../lib/ids";
import { notifyMembers } from "../lib/notify";

const router: IRouter = Router();
const uid = (req: Request) => (req as AuthedRequest).user!.id;
async function circleFor(userId: string, circleId: string) {
  const [circle] = await getDb().select().from(circlesTable).where(eq(circlesTable.id, circleId)).limit(1);
  const member = circle?.membersList?.find((m) => m.id === userId && (m.status ?? "active") === "active");
  return circle && (circle.createdBy === userId || member) ? circle : undefined;
}
function manager(circle: NonNullable<Awaited<ReturnType<typeof circleFor>>>, userId: string) {
  return circle.createdBy === userId || circle.membersList?.some((m) => m.id === userId && (m.status ?? "active") === "active" && (m.role === "admin" || m.role === "co-admin"));
}

// Reports are scoped to an active circle membership. The detailed ledger and loan
// rows are returned so clients can export without inventing totals.
router.get("/circles/:circleId/financial-report", requireAuth, async (req, res) => {
  const userId = uid(req); const circle = await circleFor(userId, String(req.params.circleId));
  if (!circle) return res.status(403).json({ message: "Circle access required." });
  if (!manager(circle, userId)) return res.status(403).json({ message: "Admin access required for circle reports." });
  const db = getDb();
  const [ledger, loans] = await Promise.all([
    db.select().from(contributionsTable).where(eq(contributionsTable.circleId, circle.id)).orderBy(desc(contributionsTable.createdAt)),
    db.select().from(loansTable).where(eq(loansTable.circleId, circle.id)),
  ]);
  const sum = (type: string) => ledger.filter((r) => r.type === type && r.status === "Complete").reduce((n, r) => n + r.amount, 0);
  return res.json({ circle: { id: circle.id, name: circle.name }, ledger, loans, totals: { contributions: sum("Contribution"), repayments: sum("Repayment"), expenses: sum("Expense"), welfare: sum("Welfare"), loansIssued: sum("LoanDisbursement"), outstandingLoans: loans.filter((l) => l.status === "Active").reduce((n, l) => n + l.balance, 0), cashRecorded: ledger.reduce((n, r) => n + ((r.type === "Expense" || r.type === "Welfare" || r.type === "LoanDisbursement") ? -r.amount : r.amount), 0) } });
});

router.get("/circles/:circleId/goals", requireAuth, async (req, res) => {
  const circle = await circleFor(uid(req), String(req.params.circleId));
  if (!circle) return res.status(403).json({ message: "Circle access required." });
  const db = getDb(); const goals = await db.select().from(savingsGoalsTable).where(eq(savingsGoalsTable.circleId, circle.id)).orderBy(desc(savingsGoalsTable.createdAt));
  const ledger = await db.select().from(contributionsTable).where(eq(contributionsTable.circleId, circle.id));
  const entries = await db.select().from(goalEntriesTable);
  return res.json(goals.map((goal) => { const linkedIds = new Set(entries.filter((entry) => entry.goalId === goal.id).map((entry) => entry.contributionId)); const contributions = ledger.filter((r) => linkedIds.has(r.id) && r.type === "Contribution" && r.status === "Complete"); return { ...goal, contributions, amountSaved: contributions.reduce((n, r) => n + r.amount, 0) }; }));
});
router.post("/goals/:goalId/contributions", requireAuth, async (req, res) => {
  const userId = uid(req); const db = getDb(); const [goal] = await db.select().from(savingsGoalsTable).where(eq(savingsGoalsTable.id, String(req.params.goalId))).limit(1);
  if (!goal || !await circleFor(userId, goal.circleId)) return res.status(403).json({ message: "Circle access required." });
  const contributionId = String(req.body?.contributionId ?? ""); const requestKey = String(req.body?.requestKey ?? "").trim().slice(0, 100);
  if (!requestKey) return res.status(400).json({ message: "A request reference is required." });
  const [contribution] = await db.select().from(contributionsTable).where(and(eq(contributionsTable.id, contributionId), eq(contributionsTable.circleId, goal.circleId), eq(contributionsTable.type, "Contribution"), eq(contributionsTable.status, "Complete"))).limit(1);
  if (!contribution || (contribution.userId !== userId && !manager((await circleFor(userId, goal.circleId))!, userId))) return res.status(403).json({ message: "Only your completed contribution can be linked." });
  try { const [entry] = await db.insert(goalEntriesTable).values({ id: newId("goal-entry"), goalId: goal.id, contributionId, userId: contribution.userId ?? userId, requestKey }).returning(); return res.status(201).json(entry); }
  catch { return res.status(409).json({ message: "That ledger entry is already linked to a goal." }); }
});
router.post("/circles/:circleId/goals", requireAuth, async (req, res) => {
  const userId = uid(req); const circle = await circleFor(userId, String(req.params.circleId));
  if (!circle || !manager(circle, userId)) return res.status(403).json({ message: "Admin access required." });
  const { name, description = "", category = "General", targetAmount, startOn, targetOn, frequency = "Monthly", memberTargets = {} } = req.body ?? {};
  if (!String(name ?? "").trim() || !Number.isSafeInteger(Number(targetAmount)) || Number(targetAmount) < 1 || !/^\d{4}-\d\d-\d\d$/.test(String(startOn)) || !/^\d{4}-\d\d-\d\d$/.test(String(targetOn)) || targetOn < startOn) return res.status(400).json({ message: "Enter a goal name, valid amount, and date range." });
  const [goal] = await getDb().insert(savingsGoalsTable).values({ id: newId("goal"), circleId: circle.id, createdBy: userId, name: String(name).trim().slice(0, 100), description: String(description).slice(0, 1000), category: String(category).slice(0, 50), targetAmount: Number(targetAmount), startOn, targetOn, frequency: String(frequency).slice(0, 20), memberTargets }).returning();
  await notifyMembers(circle, { type: "savings_goal", title: "A new savings goal", body: `${goal.name} has been added to ${circle.name}.`, link: "/goals", entityId: goal.id, exceptUserId: userId });
  return res.status(201).json(goal);
});

router.get("/circles/:circleId/meetings", requireAuth, async (req, res) => {
  const circle = await circleFor(uid(req), String(req.params.circleId)); if (!circle) return res.status(403).json({ message: "Circle access required." });
  const db = getDb(); const meetings = await db.select().from(meetingsTable).where(eq(meetingsTable.circleId, circle.id)).orderBy(desc(meetingsTable.startsAt));
  return res.json(meetings);
});
router.post("/circles/:circleId/meetings", requireAuth, async (req, res) => {
  const userId = uid(req); const circle = await circleFor(userId, String(req.params.circleId)); if (!circle || !manager(circle, userId)) return res.status(403).json({ message: "Admin access required." });
  const { title, description = "", startsAt, endsAt, location = "", meetingType = "Regular" } = req.body ?? {};
  const start = new Date(startsAt); if (!String(title ?? "").trim() || !Number.isFinite(start.getTime()) || (endsAt && new Date(endsAt) <= start)) return res.status(400).json({ message: "Enter a title and valid meeting time." });
  const [meeting] = await getDb().insert(meetingsTable).values({ id: newId("meeting"), circleId: circle.id, createdBy: userId, title: String(title).trim().slice(0, 120), description: String(description).slice(0, 3000), startsAt: start, endsAt: endsAt ? new Date(endsAt) : null, location: String(location).slice(0, 300), meetingType: String(meetingType).slice(0, 40) }).returning();
  await notifyMembers(circle, { type: "meeting", title: "Circle meeting scheduled", body: `${meeting.title} · ${start.toLocaleString()}`, link: "/meetings", entityId: meeting.id, exceptUserId: userId });
  return res.status(201).json(meeting);
});
router.put("/meetings/:meetingId/attendance", requireAuth, async (req, res) => {
  const db = getDb(); const [meeting] = await db.select().from(meetingsTable).where(eq(meetingsTable.id, String(req.params.meetingId))).limit(1); const userId = uid(req);
  if (!meeting || !await circleFor(userId, meeting.circleId)) return res.status(403).json({ message: "Circle access required." });
  const status = ["attending", "apology", "absent"].includes(req.body?.status) ? req.body.status : "attending";
  const [row] = await db.insert(attendanceTable).values({ meetingId: meeting.id, userId, status }).onConflictDoUpdate({ target: [attendanceTable.meetingId, attendanceTable.userId], set: { status, updatedAt: new Date() } }).returning(); return res.json(row);
});

router.get("/circles/:circleId/proposals", requireAuth, async (req, res) => {
  const userId = uid(req); const circle = await circleFor(userId, String(req.params.circleId)); if (!circle) return res.status(403).json({ message: "Circle access required." });
  const db = getDb(); const rows = await db.select().from(proposalsTable).where(eq(proposalsTable.circleId, circle.id)).orderBy(desc(proposalsTable.createdAt)); const results = [];
  for (const p of rows) {
    const options = await db.select().from(proposalOptionsTable).where(eq(proposalOptionsTable.proposalId, p.id)); const votes = await db.select().from(proposalVotesTable).where(eq(proposalVotesTable.proposalId, p.id));
    const visible = p.resultsVisibility === "during_vote" || p.status !== "open" || new Date(p.deadline) <= new Date();
    results.push({ ...p, options, hasVoted: votes.some((v) => v.voterKey === (p.anonymous ? createHash("sha256").update(`${p.id}:${userId}`).digest("hex") : userId)), results: visible ? options.map((o) => ({ optionId: o.id, label: o.label, votes: votes.filter((v) => v.optionId === o.id).length })) : undefined, votesCast: visible ? votes.length : undefined });
  }
  return res.json(results);
});
router.post("/circles/:circleId/proposals", requireAuth, async (req, res) => {
  const userId = uid(req); const circle = await circleFor(userId, String(req.params.circleId)); if (!circle || !manager(circle, userId)) return res.status(403).json({ message: "Admin access required." });
  const body = req.body ?? {}; const start = new Date(body.startsAt); const deadline = new Date(body.deadline); const labels = Array.isArray(body.options) ? body.options.map((x: unknown) => String(x).trim()).filter(Boolean).slice(0, 10) : [];
  if (!String(body.title ?? "").trim() || labels.length < 2 || !Number.isFinite(start.getTime()) || !Number.isFinite(deadline.getTime()) || deadline <= start || start < new Date(Date.now() - 60_000)) return res.status(400).json({ message: "Add a title, two or more options, and a valid future voting window." });
  const requestedEligible: string[] | undefined = Array.isArray(body.eligibleUserIds) ? body.eligibleUserIds.map(String) : undefined;
  const activeIds = [circle.createdBy, ...(circle.membersList ?? []).filter((m) => (m.status ?? "active") === "active").map((m) => m.id)].filter((id): id is string => Boolean(id));
  const eligible: string[] = requestedEligible ? requestedEligible.filter((id) => activeIds.includes(id)) : activeIds;
  const id = newId("proposal"); const [proposal] = await getDb().insert(proposalsTable).values({ id, circleId: circle.id, createdBy: userId, title: String(body.title).trim().slice(0, 150), description: String(body.description ?? "").slice(0, 5000), startsAt: start, deadline, eligibleUserIds: [...new Set(eligible)], anonymous: Boolean(body.anonymous), approvalThreshold: Math.max(1, Math.min(100, Number(body.approvalThreshold) || 50)), allowAbstentions: Boolean(body.allowAbstentions), resultsVisibility: body.resultsVisibility === "during_vote" ? "during_vote" : "after_close" }).returning();
  await getDb().insert(proposalOptionsTable).values(labels.map((label: string, position: number) => ({ id: newId("option"), proposalId: id, label: label.slice(0, 100), position })));
  await notifyMembers(circle, { type: "proposal", title: "A new proposal is open", body: proposal.title, link: "/proposals", entityId: id, exceptUserId: userId }); return res.status(201).json(proposal);
});
router.post("/proposals/:proposalId/vote", requireAuth, async (req, res) => {
  const db = getDb(); const userId = uid(req); const [p] = await db.select().from(proposalsTable).where(eq(proposalsTable.id, String(req.params.proposalId))).limit(1);
  if (!p || !await circleFor(userId, p.circleId) || !p.eligibleUserIds.includes(userId)) return res.status(403).json({ message: "You are not eligible to vote." });
  if (p.status !== "open" || new Date() < p.startsAt || new Date() > p.deadline) return res.status(409).json({ message: "Voting is not open." });
  const optionId = String(req.body?.optionId ?? ""); const [option] = await db.select().from(proposalOptionsTable).where(and(eq(proposalOptionsTable.id, optionId), eq(proposalOptionsTable.proposalId, p.id))).limit(1); if (!option) return res.status(400).json({ message: "Choose a valid option." });
  const voterKey = p.anonymous ? createHash("sha256").update(`${p.id}:${userId}`).digest("hex") : userId;
  try { await db.insert(proposalVotesTable).values({ id: newId("vote"), proposalId: p.id, voterKey, voterUserId: p.anonymous ? null : userId, optionId }); }
  catch { return res.status(409).json({ message: "A vote has already been recorded." }); }
  return res.status(201).json({ ok: true });
});

export default router;
