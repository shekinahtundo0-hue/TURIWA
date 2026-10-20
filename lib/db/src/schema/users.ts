import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  // Phone identifies a password account; email identifies a Google account.
  // Either can be absent, so both are nullable and uniquely indexed.
  phone: text("phone").unique(),
  email: text("email").unique(),
  googleId: text("google_id").unique(),
  passwordHash: text("password_hash"),
  // Set while the member is enrolling an authenticator app; only becomes the
  // active secret once they prove they can generate a code from it.
  twoFactorSecret: text("two_factor_secret"),
  twoFactorEnabledAt: timestamp("two_factor_enabled_at", { mode: "date" }),
  // Scrypt hashes of the single-use recovery codes, serialised as a JSON array.
  backupCodes: text("backup_codes"),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
});

export type User = typeof usersTable.$inferSelect;
