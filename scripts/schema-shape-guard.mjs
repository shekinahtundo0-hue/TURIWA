// The schema bootstrap is ninety-odd idempotent statements, and it now runs once per shape
// rather than once per boot — see `ensureSchema` in lib/db/src/bootstrap.ts. The marker that
// makes that work is a constant in that file, and a constant someone can forget is a migration
// that silently never reaches the hosted database. This script makes forgetting loud.
//
//   node scripts/schema-shape-guard.mjs            fail if the statements changed and the marker did not
//   node scripts/schema-shape-guard.mjs --accept   record the current statements for the current marker
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "lib", "db", "src", "bootstrap.ts");
const RECORD = join(ROOT, "scripts", "schema-shape.json");
const DECLARATION = "async function createSchema(db: AppDb): Promise<void> {";

/** The body of the statement list, taken to its matching brace. */
function statementBody(source) {
  const start = source.indexOf(DECLARATION);
  if (start < 0) throw new Error(`createSchema is missing from ${SOURCE}`);
  let cursor = start + DECLARATION.length;
  let depth = 1;
  while (cursor < source.length && depth > 0) {
    const char = source[cursor];
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    cursor += 1;
  }
  if (depth !== 0) throw new Error("createSchema does not close — check its braces.");
  return source.slice(start + DECLARATION.length, cursor - 1);
}

/**
 * What counts as a change of shape: a statement's text, not how it is laid out. Re-indenting or
 * rewrapping a line must not force a bump, so whole-line comments go and whitespace runs
 * collapse. A comment at the end of a statement line still counts as part of that statement.
 */
function normalize(body) {
  return body
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
    .replace(/\s+/g, " ")
    .trim();
}

const source = readFileSync(SOURCE, "utf8");
const body = statementBody(source);
const shape = /const SCHEMA_SHAPE = "([^"]+)"/.exec(source)?.[1];
if (!shape) throw new Error("SCHEMA_SHAPE is missing from the bootstrap.");

const statements = (body.match(/db\.execute\(/g) ?? []).length;
const hash = createHash("sha256").update(normalize(body)).digest("hex");
const record = JSON.parse(readFileSync(RECORD, "utf8"));
const accept = process.argv.includes("--accept");

if (accept) {
  if (record.shape === shape && record.hash !== hash) {
    console.error(
      `The statements changed but SCHEMA_SHAPE is still "${shape}". Bump it in bootstrap.ts so ` +
        "every deployed database is taken to the new shape, then run --accept again.",
    );
    process.exit(1);
  }
  writeFileSync(RECORD, `${JSON.stringify({ shape, hash, statements }, null, 2)}\n`);
  console.log(`Recorded shape "${shape}": ${statements} statements, ${hash.slice(0, 16)}.`);
  process.exit(0);
}

if (record.shape === shape && record.hash === hash) {
  console.log(`Shape "${shape}": ${statements} statements, runs once per database.`);
  process.exit(0);
}

if (record.shape !== shape) {
  console.error(
    `Shape moved from "${record.shape}" to "${shape}" and the recorded statements no longer match ` +
      "it. Run `node scripts/schema-shape-guard.mjs --accept` to record what the new shape sends.",
  );
  process.exit(1);
}

console.error(
  `The statements in createSchema changed while SCHEMA_SHAPE stayed "${shape}". A database already ` +
    "at that shape would never be told about them.\n" +
    "Bump SCHEMA_SHAPE in lib/db/src/bootstrap.ts, then run `node scripts/schema-shape-guard.mjs --accept`.",
);
process.exit(1);
