import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// What a notification is about. The list is deliberately closed: every screen that
// renders a notification picks an icon from it, so a kind that no screen knows would
// arrive as a blank row rather than a message.
export const NOTIFICATION_TYPES = [
  "loan_application",
  "loan_approved",
  "loan_rejected",
  "loan_repayment",
  "loan_due",
  "loan_overdue",
  "contribution",
  "contribution_reminder",
  "contribution_missed",
  "fine",
  "member_joined",
  "member_removed",
  "role_changed",
  "savings_goal",
  "savings_update",
  "meeting",
  "meeting_update",
  "proposal",
  "vote_reminder",
  "vote_result",
  "announcement",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const notificationsTable = pgTable("notifications", {
  id: text("id").primaryKey(),
  // The one account that may read this row. Written by the API from the event that
  // caused it, never from anything the caller sends.
  userId: text("user_id").notNull(),
  circleId: text("circle_id"),
  type: text("type").$type<NotificationType>().notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  // The screen the notification is about, as a path the app already understands.
  link: text("link"),
  // What the notification is about, so a screen can open the exact row.
  entityId: text("entity_id"),
  // Set when the notification has been shown. Null means unread.
  readAt: timestamp("read_at", { mode: "date" }),
  // A stable key for events that must not be announced twice — one reminder per
  // cycle, one receipt per loan, one "you were removed" per membership. Unique
  // where present, so a retried request cannot duplicate it.
  dedupeKey: text("dedupe_key"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export type Notification = typeof notificationsTable.$inferSelect;

// One person's choices, per circle. A row with no circle is the account-wide default
// that a circle can override. Every switch is on unless the person turns it off, so
// an old row that predates a new kind keeps receiving it.
export const notificationPreferencesTable = pgTable("notification_preferences", {
  userId: text("user_id").notNull(),
  circleId: text("circle_id").notNull().default(""),
  contributionReminders: boolean("contribution_reminders").notNull().default(true),
  loanReminders: boolean("loan_reminders").notNull().default(true),
  meetingReminders: boolean("meeting_reminders").notNull().default(true),
  savingsUpdates: boolean("savings_updates").notNull().default(true),
  voteReminders: boolean("vote_reminders").notNull().default(true),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});

export type NotificationPreference = typeof notificationPreferencesTable.$inferSelect;
