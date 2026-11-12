import { Router, type IRouter, type Request } from "express";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import {
  circlesTable,
  contributionsTable,
  getDb,
  loansTable,
  notificationsTable,
  type Circle,
  type Contribution,
  type Notification,
} from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../lib/auth";
import { asFrequency, type Frequency } from "../lib/store";
import { cycleLabel, cycleStart, writtenAt } from "../lib/fines";
import { isoDay, kes } from "../lib/money";
import { listPreferences, notify, savePreference } from "../lib/notify";

const router: IRouter = Router();

function userIdOf(req: Request): string {
  return (req as AuthedRequest).user!.id;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** The first day after the cycle that starts at `start`. */
function cycleEnd(frequency: Frequency, start: Date): Date {
  if (frequency === "Monthly") return new Date(start.getFullYear(), start.getMonth() + 1, 1);
  return new Date(start.getTime() + (frequency === "Weekly" ? 7 : 14) * DAY_MS);
}

/** How far into a cycle the reminder starts: halfway through, so a member is nudged
 *  in time to pay rather than on the day the cycle opens. */
function reminderDay(frequency: Frequency, start: Date): Date {
  const length = cycleEnd(frequency, start).getTime() - start.getTime();
  return new Date(start.getTime() + Math.floor(length / 2));
}

async function circlesFor(userId: string): Promise<Circle[]> {
  const db = getDb();
  return db
    .select()
    .from(circlesTable)
    .where(
      or(
        eq(circlesTable.createdBy, userId),
        sql`${circlesTable.membersList} @> ${JSON.stringify([{ id: userId }])}::jsonb AND NOT (${circlesTable.membersList} @> ${JSON.stringify([{ id: userId, status: "pending" }])}::jsonb) AND NOT (${circlesTable.membersList} @> ${JSON.stringify([{ id: userId, status: "removed" }])}::jsonb)`,
      ),
    );
}

function activeIn(circle: Circle, userId: string): boolean {
  return circle.createdBy === userId || (circle.membersList ?? []).some(
    (member) => member.id === userId && (member.status ?? "active") === "active",
  );
}

function attributedUserId(
  circle: Circle,
  row: Pick<Contribution, "member" | "userId" | "recordedBy">,
): string | null {
  // New rows separate the recorder from the immutable beneficiary. A renamed or
  // reused display name must never move their payment to another account.
  if (row.recordedBy != null) return row.userId;
  const name = (row.member ?? "").trim().toLowerCase();
  if (!name) return row.userId;
  const matches = (circle.membersList ?? []).filter((member) => member.name.trim().toLowerCase() === name);
  // Legacy userId may be the recorder, not the payer. Neither an unmatched or
  // duplicate name nor a conflict with that id proves who paid; do not guess.
  if (matches.length !== 1 || (row.userId != null && row.userId !== matches[0].id)) return null;
  return matches[0].id;
}

/** Only the exact day format written by circle creation/join is evidence. Never
 *  turn a month label, locale-dependent date or invalid day into a join date. */
function joinedOn(value: string | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

function eligibleForMissedCycle(circle: Circle, userId: string, previous: Date): boolean {
  const members = circle.membersList ?? [];
  const memberships = members.filter((member) => member.id === userId);
  if (memberships.length !== 1) return false;
  const joined = joinedOn(memberships[0].joinedDate);
  if (!joined || joined > previous) return false;
  // Circles have no creation timestamp. The founder's join day is the creation
  // evidence we do store. If absent, the member's own exact join day proves the
  // circle existed; if present but ambiguous, do not infer an earlier start.
  const founders = members.filter((member) => member.id === circle.createdBy);
  if (founders.length === 0) return true;
  if (founders.length !== 1) return false;
  const founded = joinedOn(founders[0].joinedDate);
  return founded !== null && founded <= previous;
}

/**
 * Reminders that are due right now, written as persistent notifications once per
 * cycle or per loan state. A hosted app has no scheduler, so the check runs when the
 * member opens the app; the dedupe key makes it safe to run on every request.
 */
async function generateDueReminders(userId: string): Promise<void> {
  const db = getDb();
  const circles = (await circlesFor(userId)).filter((circle) => activeIn(circle, userId));
  if (circles.length === 0) return;

  const circleIds = circles.map((circle) => circle.id);
  const [rows, loans] = await Promise.all([
    db.select().from(contributionsTable).where(inArray(contributionsTable.circleId, circleIds)),
    db.select().from(loansTable).where(inArray(loansTable.circleId, circleIds)),
  ]);

  const now = new Date();

  for (const circle of circles) {
    const frequency = asFrequency(circle.frequency);
    const circleRows = rows.filter((row) => row.circleId === circle.id);
    let firstRecord: Date | null = null;
    for (const row of circleRows) {
      const at = writtenAt(row.createdAt);
      if (at && (!firstRecord || at < firstRecord)) firstRecord = at;
    }
    const start = cycleStart(frequency, firstRecord, now);
    const end = cycleEnd(frequency, start);
    const previous = frequency === "Monthly"
      ? new Date(start.getFullYear(), start.getMonth() - 1, 1)
      : new Date(start.getFullYear(), start.getMonth(), start.getDate() - (frequency === "Weekly" ? 7 : 14));

    const aboutMe = (row: Contribution) => attributedUserId(circle, row) === userId;

    const paidInCycle = (from: Date, to: Date | null) =>
      circleRows
        .filter((row) => {
          const at = writtenAt(row.createdAt);
          if (!at || at < from) return false;
          if (to && at >= to) return false;
          return row.type === "Contribution" && row.status === "Complete" && aboutMe(row);
        })
        .reduce((sum, row) => sum + row.amount, 0);

    const due = circle.contribution > 0;
    const paidNow = paidInCycle(start, null);
    if (due && now >= reminderDay(frequency, start) && now < end) {
      const short = circle.contribution - paidNow;
      if (short > 0) {
        await notify({
          userId,
          circleId: circle.id,
          type: "contribution_reminder",
          title: `${circle.name}: contribution due`,
          body: `${kes(short)} still to pay for ${cycleLabel(frequency)}. The group asks for ${kes(circle.contribution)} a cycle.`,
          link: "/statement",
          entityId: circle.id,
          dedupeKey: `contribution-reminder:${circle.id}:${userId}:${isoDay(start)}`,
        });
      }
    }

    // Only a full cycle after both creation and joining can be called missed. A
    // fortnightly circle without a ledger anchor has no known previous cycle.
    if (due && (frequency !== "Bi-weekly" || firstRecord !== null) && eligibleForMissedCycle(circle, userId, previous)) {
      const paidPrevious = paidInCycle(previous, start);
      if (paidPrevious < circle.contribution) {
        await notify({
          userId,
          circleId: circle.id,
          type: "contribution_missed",
          title: `${circle.name}: missed contribution`,
          body: `No full ${kes(circle.contribution)} contribution was recorded for the cycle ending ${isoDay(start)}. Pay it when you can, or talk to the group admin.`,
          link: "/statement",
          entityId: circle.id,
          dedupeKey: `contribution-missed:${circle.id}:${userId}:${isoDay(previous)}`,
        });
      }
    }
  }

  for (const loan of loans) {
    if (loan.userId !== userId || loan.status !== "Active" || loan.balance === 0 || !loan.dueOn) continue;
    const circle = circles.find((item) => item.id === loan.circleId);
    if (!circle) continue;
    const dueAt = new Date(`${loan.dueOn}T00:00:00`).getTime();
    const days = Math.round((dueAt - startOfDay(now).getTime()) / DAY_MS);
    if (days < 0) {
      await notify({
        userId,
        circleId: loan.circleId,
        type: "loan_overdue",
        title: `Loan past its due date`,
        body: `${kes(loan.balance)} is still owing on your "${loan.purpose}" loan, due ${loan.dueDate}.`,
        link: "/loans",
        entityId: loan.id,
        dedupeKey: `loan-overdue:${loan.id}`,
      });
    } else if (days <= 7) {
      await notify({
        userId,
        circleId: loan.circleId,
        type: "loan_due",
        title: `Loan repayment due`,
        body: `${kes(loan.monthlyRepayment)} is due on ${loan.dueDate} for your "${loan.purpose}" loan. ${kes(loan.balance)} remains outstanding.`,
        link: "/loans",
        entityId: loan.id,
        dedupeKey: `loan-due:${loan.id}:${loan.dueOn}`,
      });
    }
  }
}

function shape(row: Notification, circleName: string | null) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    link: row.link,
    entityId: row.entityId,
    circleId: row.circleId,
    circleName,
    read: row.readAt !== null,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}

router.get("/notifications", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  try {
    await generateDueReminders(userId);
  } catch (error) {
    // A reminder that cannot be computed must not close the notification centre.
    console.error("[notify] reminder pass failed", {
      message: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    });
  }
  const db = getDb();
  const [rows, unread, preferences, circles] = await Promise.all([
    db
      .select()
      .from(notificationsTable)
      .where(eq(notificationsTable.userId, userId))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(120),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt))),
    listPreferences(userId),
    circlesFor(userId),
  ]);
  const names = new Map(circles.map((circle) => [circle.id, circle.name]));
  res.json({
    notifications: rows.map((row) => shape(row, row.circleId ? names.get(row.circleId) ?? null : null)),
    unreadCount: unread[0]?.count ?? 0,
    preferences: preferences.map((row) => ({
      circleId: row.circleId,
      contributionReminders: row.contributionReminders,
      loanReminders: row.loanReminders,
      meetingReminders: row.meetingReminders,
      savingsUpdates: row.savingsUpdates,
      voteReminders: row.voteReminders,
    })),
  });
});

router.post("/notifications/:id/read", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  await getDb()
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.id, String(req.params.id)), eq(notificationsTable.userId, userId)));
  res.json({ ok: true });
});

router.post("/notifications/read-all", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  await getDb()
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt)));
  res.json({ ok: true });
});

router.patch("/notifications/preferences", requireAuth, async (req, res) => {
  const userId = userIdOf(req);
  const circleId = String(req.body?.circleId ?? "");
  const read = (key: string) => (typeof req.body?.[key] === "boolean" ? (req.body[key] as boolean) : undefined);
  const settings = {
    contributionReminders: read("contributionReminders"),
    loanReminders: read("loanReminders"),
    meetingReminders: read("meetingReminders"),
    savingsUpdates: read("savingsUpdates"),
    voteReminders: read("voteReminders"),
  };
  // A circle setting is only meaningful for a circle this account belongs to, so a
  // guessed id cannot be used to write rows against somebody else's group.
  if (circleId) {
    const circle = (await circlesFor(userId)).find((item) => item.id === circleId);
    if (!circle) {
      res.status(404).json({ message: "That group is not on your record." });
      return;
    }
  }
  await savePreference(userId, circleId, settings);
  res.json({ ok: true });
});

export default router;
