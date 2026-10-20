import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const authCodesTable = pgTable("auth_codes", {
  id: text("id").primaryKey(),
  phone: text("phone").notNull(),
  purpose: text("purpose").notNull(),
  code: text("code").notNull(),
  // A code is guessable (6 digits) and the only thing between a stranger and an
  // account's money, so the row itself carries how often it has been tried.
  attempts: integer("attempts").notNull().default(0),
  // Sign-up proves this code before there is an account to attach it to, so proof is
  // recorded here and account creation is what spends it.
  verifiedAt: timestamp("verified_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
});

export type AuthCode = typeof authCodesTable.$inferSelect;
