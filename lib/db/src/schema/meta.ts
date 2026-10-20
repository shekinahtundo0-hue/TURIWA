import { pgTable, text } from "drizzle-orm/pg-core";

export const appMetaTable = pgTable("app_meta", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});
