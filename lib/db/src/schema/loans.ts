import { integer, pgTable, text } from "drizzle-orm/pg-core";
import type { InterestPeriod } from "./circles";

export const loansTable = pgTable("loans", {
  id: text("id").primaryKey(),
  // A loan belongs to the member who took it, not to the database.
  userId: text("user_id"),
  // The group it was borrowed through. Its rate sets the repayments and its admin
  // decides on the request, so a loan without this link belongs to nobody's ledger.
  circleId: text("circle_id"),
  principal: integer("principal").notNull(),
  balance: integer("balance").notNull(),
  monthlyRepayment: integer("monthly_repayment").notNull(),
  // What the loan grows to by the end of its term. Stored rather than re-derived,
  // because the group is free to change its rate after the money is lent.
  totalPayable: integer("total_payable").notNull(),
  months: integer("months").notNull(),
  interestRate: integer("interest_rate").notNull(),
  interestPeriod: text("interest_period").$type<InterestPeriod>().notNull().default("Month"),
  dueDate: text("due_date").notNull(),
  // The same day as `dueDate`, in `2026-10-15` form. A screen cannot ask "is this
  // overdue" of a label written for a person to read, so the machine-readable date
  // is stored beside it. Loans written before this column exist have none, and the
  // app says so instead of guessing.
  dueOn: text("due_on"),
  purpose: text("purpose").notNull(),
  status: text("status").notNull(),
});

export type Loan = typeof loansTable.$inferSelect;
