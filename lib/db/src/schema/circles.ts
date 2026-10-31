import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

export type MemberRole = "admin" | "co-admin" | "member";
export type MemberStatus = "pending" | "active";
// A group decides whether its rate is quoted per month or per year; the money
// compounds on the outstanding balance either way.
export type InterestPeriod = "Month" | "Year";

// An invite is stored on the group row: a roster is only ever read with its
// circle, and every change to it is an admin action on that one circle.
export type CircleMemberRow = {
  id: string;
  name: string;
  phone: string | null;
  role: MemberRole;
  status: MemberStatus;
  joinedDate: string;
};

export const circlesTable = pgTable("circles", {
  id: text("id").primaryKey(),
  // A private, shareable code lets a signed-in account join without exposing
  // circle discovery or relying on the database row id as a secret.
  joinCode: text("join_code").unique(),
  name: text("name").notNull(),
  // Head of active roster entries, kept in step with membersList.
  members: integer("members").notNull(),
  membersList: jsonb("members_list").$type<CircleMemberRow[]>(),
  target: integer("target").notNull(),
  // Recurring amount each member pays, sized to `frequency`.
  contribution: integer("contribution").notNull(),
  frequency: text("frequency").notNull().default("Monthly"),
  joiningFee: integer("joining_fee").notNull().default(0),
  welfare: integer("welfare").notNull().default(0),
  loanInterestPercent: integer("loan_interest_percent").notNull().default(5),
  loanInterestPeriod: text("loan_interest_period").$type<InterestPeriod>().notNull().default("Month"),
  // The member who opened the group is its first admin.
  createdBy: text("created_by"),
  color: text("color").notNull(),
});

export type Circle = typeof circlesTable.$inferSelect;
