import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const contributionsTable = pgTable("contributions", {
  id: text("id").primaryKey(),
  circleId: text("circle_id").notNull(),
  // The member whose account this payment came from.
  userId: text("user_id"),
  amount: integer("amount").notNull(),
  date: text("date").notNull(),
  note: text("note").notNull(),
  status: text("status").notNull(),
  // Which side of the ledger the entry sits on: money in or money out.
  type: text("type").notNull().default("Contribution"),
  // The roster member the entry is attributed to, by name.
  member: text("member"),
  // Set on the entries a loan writes for itself — the money handed out and the
  // repayments that came back — so a loan's cash is never counted twice.
  loanId: text("loan_id"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export type Contribution = typeof contributionsTable.$inferSelect;
