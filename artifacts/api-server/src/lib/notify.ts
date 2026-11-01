import { and, eq, inArray } from "drizzle-orm";
import {
  getDb,
  notificationPreferencesTable,
  notificationsTable,
  type Circle,
  type NotificationPreference,
  type NotificationType,
} from "@workspace/db";
import { newId } from "./ids";

type Executor = Pick<ReturnType<typeof getDb>, "insert" | "select">;
type PreferenceField =
  | "contributionReminders"
  | "loanReminders"
  | "meetingReminders"
  | "savingsUpdates"
  | "voteReminders";

// Which switch silences which kind. Kinds with no entry (a removal, a role change,
// a fine) are about the person's own standing in the circle and cannot be muted:
// an app that quietly swallows "you were removed" is worse than a noisy one.
const PREFERENCE_FOR: Partial<Record<NotificationType, PreferenceField>> = {
  contribution: "contributionReminders",
  contribution_reminder: "contributionReminders",
  contribution_missed: "contributionReminders",
  loan_application: "loanReminders",
  loan_approved: "loanReminders",
  loan_rejected: "loanReminders",
  loan_repayment: "loanReminders",
  loan_due: "loanReminders",
  loan_overdue: "loanReminders",
  meeting: "meetingReminders",
  meeting_update: "meetingReminders",
  savings_goal: "savingsUpdates",
  savings_update: "savingsUpdates",
  proposal: "voteReminders",
  vote_reminder: "voteReminders",
  vote_result: "voteReminders",
};

export type PreferenceRow = NotificationPreference;

export type NotifyInput = {
  userId: string;
  circleId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  entityId?: string | null;
  dedupeKey?: string | null;
};

/** Whether this person still wants this kind of notification for this circle. A
 *  circle-specific row wins over the account-wide default; no row at all means on. */
export async function notificationAllowed(
  userId: string,
  circleId: string | null,
  type: NotificationType,
  executor: Executor = getDb(),
): Promise<boolean> {
  const field = PREFERENCE_FOR[type];
  if (!field) return true;
  const scope = circleId ? [circleId, ""] : [""];
  const rows = await executor
    .select()
    .from(notificationPreferencesTable)
    .where(
      and(
        eq(notificationPreferencesTable.userId, userId),
        inArray(notificationPreferencesTable.circleId, scope),
      ),
    );
  const row = circleId
    ? rows.find((item) => item.circleId === circleId) ?? rows.find((item) => item.circleId === "")
    : rows[0];
  return row ? row[field] !== false : true;
}

/**
 * Write one notification for one person. A duplicate key is ignored rather than
 * rejected, so a retried request, a double-tap or a reminder recomputed on every
 * poll still leaves exactly one row. A failure here is logged and swallowed: being
 * told about a payment must never be the reason the payment itself fails.
 */
export async function notify(input: NotifyInput, executor: Executor = getDb()): Promise<void> {
  try {
    const allowed = await notificationAllowed(input.userId, input.circleId ?? null, input.type, executor);
    if (!allowed) return;
    await executor
      .insert(notificationsTable)
      .values({
        id: newId("n"),
        userId: input.userId,
        circleId: input.circleId ?? null,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link ?? null,
        entityId: input.entityId ?? null,
        dedupeKey: input.dedupeKey ?? null,
      })
      .onConflictDoNothing();
  } catch (error) {
    console.error("[notify] could not write notification", {
      type: input.type,
      message: error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
    });
  }
}

/** The active people who administer a circle: its founder and its Co-Admins. */
export function managerIds(circle: Circle): string[] {
  const ids = new Set<string>();
  if (circle.createdBy) ids.add(circle.createdBy);
  for (const member of circle.membersList ?? []) {
    if ((member.status ?? "active") !== "active") continue;
    if (member.role === "admin" || member.role === "co-admin") ids.add(member.id);
  }
  return [...ids];
}

/** Everyone the circle currently holds, by account id. */
export function activeMemberIds(circle: Circle): string[] {
  return (circle.membersList ?? [])
    .filter((member) => (member.status ?? "active") === "active")
    .map((member) => member.id);
}

export async function notifyManagers(
  circle: Circle,
  input: Omit<NotifyInput, "userId" | "circleId"> & { exceptUserId?: string | null },
  executor: Executor = getDb(),
): Promise<void> {
  const { exceptUserId, ...rest } = input;
  await Promise.all(
    managerIds(circle)
      .filter((id) => id !== exceptUserId)
      .map((userId) => notify({ ...rest, userId, circleId: circle.id }, executor)),
  );
}

export async function notifyMembers(
  circle: Circle,
  input: Omit<NotifyInput, "userId" | "circleId"> & { exceptUserId?: string | null },
  executor: Executor = getDb(),
): Promise<void> {
  const { exceptUserId, ...rest } = input;
  await Promise.all(
    activeMemberIds(circle)
      .filter((id) => id !== exceptUserId)
      .map((userId) => notify({ ...rest, userId, circleId: circle.id }, executor)),
  );
}

/** The preferences a person has, circle-specific rows included, in a shape the
 *  settings screen can edit and the API can save back. */
export async function listPreferences(
  userId: string,
  executor: Executor = getDb(),
): Promise<NotificationPreference[]> {
  return executor
    .select()
    .from(notificationPreferencesTable)
    .where(eq(notificationPreferencesTable.userId, userId));
}

export async function savePreference(
  userId: string,
  circleId: string,
  settings: Partial<Record<PreferenceField, boolean>>,
  executor: Pick<ReturnType<typeof getDb>, "insert" | "select"> = getDb(),
): Promise<void> {
  const existing = await executor
    .select()
    .from(notificationPreferencesTable)
    .where(
      and(
        eq(notificationPreferencesTable.userId, userId),
        eq(notificationPreferencesTable.circleId, circleId),
      ),
    );
  const current = existing[0];
  const values = {
    contributionReminders: settings.contributionReminders ?? current?.contributionReminders ?? true,
    loanReminders: settings.loanReminders ?? current?.loanReminders ?? true,
    meetingReminders: settings.meetingReminders ?? current?.meetingReminders ?? true,
    savingsUpdates: settings.savingsUpdates ?? current?.savingsUpdates ?? true,
    voteReminders: settings.voteReminders ?? current?.voteReminders ?? true,
  };
  if (current) {
    await executor
      .insert(notificationPreferencesTable)
      .values({ userId, circleId, ...values, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [notificationPreferencesTable.userId, notificationPreferencesTable.circleId],
        set: { ...values, updatedAt: new Date() },
      });
    return;
  }
  await executor
    .insert(notificationPreferencesTable)
    .values({ userId, circleId, ...values })
    .onConflictDoNothing();
}
