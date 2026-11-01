import { boolean, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export type SavingsGoal = typeof savingsGoalsTable.$inferSelect;
export const savingsGoalsTable = pgTable("savings_goals", {
  id: text("id").primaryKey(), circleId: text("circle_id").notNull(), createdBy: text("created_by").notNull(),
  name: text("name").notNull(), description: text("description").notNull().default(""), category: text("category").notNull().default("General"),
  targetAmount: integer("target_amount").notNull(), startOn: text("start_on").notNull(), targetOn: text("target_on").notNull(),
  frequency: text("frequency").notNull().default("Monthly"), memberTargets: jsonb("member_targets").$type<Record<string, number>>().notNull().default({}),
  status: text("status").notNull().default("active"), cancelReason: text("cancel_reason"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const goalEntriesTable = pgTable("savings_goal_entries", {
  id: text("id").primaryKey(), goalId: text("goal_id").notNull(), contributionId: text("contribution_id").notNull().unique(),
  userId: text("user_id").notNull(), requestKey: text("request_key").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("goal_entry_request_unique").on(table.goalId, table.userId, table.requestKey)]);

export const meetingsTable = pgTable("circle_meetings", {
  id: text("id").primaryKey(), circleId: text("circle_id").notNull(), createdBy: text("created_by").notNull(), title: text("title").notNull(),
  description: text("description").notNull().default(""), startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }), location: text("location").notNull().default(""), meetingType: text("meeting_type").notNull().default("Regular"),
  status: text("status").notNull().default("scheduled"), minutes: text("minutes").notNull().default(""), attachments: jsonb("attachments").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const attendanceTable = pgTable("meeting_attendance", {
  meetingId: text("meeting_id").notNull(), userId: text("user_id").notNull(), status: text("status").notNull().default("attending"),
  note: text("note").notNull().default(""), updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.meetingId, table.userId] })]);

export const meetingActionsTable = pgTable("meeting_action_items", {
  id: text("id").primaryKey(), meetingId: text("meeting_id").notNull(), assignedTo: text("assigned_to").notNull(), title: text("title").notNull(),
  dueOn: text("due_on"), status: text("status").notNull().default("open"), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proposalsTable = pgTable("circle_proposals", {
  id: text("id").primaryKey(), circleId: text("circle_id").notNull(), createdBy: text("created_by").notNull(), title: text("title").notNull(),
  description: text("description").notNull().default(""), startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  deadline: timestamp("deadline", { withTimezone: true }).notNull(), eligibleUserIds: jsonb("eligible_user_ids").$type<string[]>().notNull(),
  anonymous: boolean("anonymous").notNull().default(false), approvalThreshold: integer("approval_threshold").notNull().default(50),
  allowAbstentions: boolean("allow_abstentions").notNull().default(false), resultsVisibility: text("results_visibility").notNull().default("after_close"),
  status: text("status").notNull().default("open"), closedAt: timestamp("closed_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const proposalOptionsTable = pgTable("proposal_options", {
  id: text("id").primaryKey(), proposalId: text("proposal_id").notNull(), label: text("label").notNull(), position: integer("position").notNull(),
});

export const proposalVotesTable = pgTable("proposal_votes", {
  id: text("id").primaryKey(), proposalId: text("proposal_id").notNull(), voterKey: text("voter_key").notNull(),
  voterUserId: text("voter_user_id"), optionId: text("option_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex("proposal_vote_once").on(table.proposalId, table.voterKey)]);
