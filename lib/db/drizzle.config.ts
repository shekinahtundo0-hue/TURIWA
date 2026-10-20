import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "drizzle-kit";

function applyEnvFile(filePath: string): void {
  if (!existsSync(filePath)) return;
  const text = readFileSync(filePath, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] == null || process.env[key] === "") {
      process.env[key] = value;
    }
  }
}

applyEnvFile(path.resolve(process.cwd(), ".env"));
applyEnvFile(path.resolve(__dirname, "../../.env"));

const url = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? "";

if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
  throw new Error(
    "drizzle-kit push requires a Postgres DATABASE_URL (use your Supabase URI). The API can still use PGlite without this.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url,
  },
});
