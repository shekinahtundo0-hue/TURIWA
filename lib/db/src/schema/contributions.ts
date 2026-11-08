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
  // Who was signed in when the money was put on the book. The roster names the member
  // the money is attributed to; this names the person who recorded it, which is a
  // different question and one an audit asks.
  recordedBy: text("recorded_by"),
  // How the cash arrived and the slip that proves it (a mobile-money confirmation, a
  // cheque number). Optional, stored as the recorder typed it, never derived.
  method: text("method"),
  reference: text("reference"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export type Contribution = typeof contributionsTable.$inferSelect;
