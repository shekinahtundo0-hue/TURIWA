// A backup you have never restored is not a backup. This script makes a snapshot only
// while nothing is writing to the database, records a hash for every file, and can put
// a snapshot back and prove the files still match.
//
//   node scripts/backup-db.mjs                     snapshot the local database
//   node scripts/backup-db.mjs --verify <dir>      check a snapshot's hashes
//   node scripts/backup-db.mjs --restore <dir>     put a snapshot back in place
import { createHash } from "node:crypto";
import { createConnection } from "node:net";
import { cpSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "artifacts", "api-server", "data", "turiwa");
const BACKUPS = join(ROOT, "backups");
const PORT = Number(process.env.PORT || 5000);

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

function portInUse() {
  return new Promise((done) => {
    const socket = createConnection({ host: "127.0.0.1", port: PORT });
    socket.setTimeout(700);
    socket.once("connect", () => { socket.destroy(); done(true); });
    socket.once("timeout", () => { socket.destroy(); done(false); });
    socket.once("error", () => done(false));
  });
}

function walk(dir, base = dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    return entry.isDirectory() ? walk(full, base) : [relative(base, full).replaceAll("\\", "/")];
  });
}

function hash(file) {
  return new Promise((done, fail) => {
    const sum = createHash("sha256");
    createReadStream(file).on("data", (chunk) => sum.update(chunk)).on("end", () => done(sum.digest("hex"))).on("error", fail);
  });
}

async function manifest(dir) {
  const files = walk(dir).sort();
  const rows = [];
  for (const file of files) {
    rows.push({ file, sha256: await hash(join(dir, file)), bytes: statSync(join(dir, file)).size });
  }
  return rows;
}

async function snapshot() {
  if (!existsSync(SOURCE)) {
    console.error(`No database at ${SOURCE}. Start the API once so it can create one.`);
    process.exit(1);
  }
  if (await portInUse()) {
    console.error(`The API is answering on port ${PORT}. Stop it first — a copy taken mid-write`);
    console.error("can open as a database that disagrees with itself.");
    process.exit(1);
  }
  const target = join(BACKUPS, stamp());
  // cpSync copies a directory's contents into its destination, so the database gets a
  // named home in the snapshot rather than dissolving into it.
  const copy = join(target, "turiwa");
  mkdirSync(copy, { recursive: true });
  cpSync(SOURCE, copy, { recursive: true });
  const rows = await manifest(copy);
  writeFileSync(join(target, "SHA256SUMS.txt"), rows.map((r) => `${r.sha256}  turiwa/${r.file}`).join("\n") + "\n");
  writeFileSync(
    join(target, "manifest.json"),
    JSON.stringify({
      created: new Date().toISOString(),
      source: relative(ROOT, SOURCE).replaceAll("\\", "/"),
      files: rows.length,
      bytes: rows.reduce((sum, r) => sum + r.bytes, 0),
      tables: readFileSync(join(SOURCE, "PG_VERSION"), "utf8").trim() === "17" ? "postgres 17 layout" : "unknown postgres layout",
    }, null, 2) + "\n",
  );
  console.log(`Backed up ${rows.length} files, ${(rows.reduce((s, r) => s + r.bytes, 0) / 1048576).toFixed(1)} MB`);
  console.log(`Snapshot: ${relative(ROOT, target)}`);
  console.log(`Verify with: node scripts/backup-db.mjs --verify ${relative(ROOT, target)}`);
}

async function verify(dir) {
  const root = resolve(ROOT, dir);
  const sums = join(root, "SHA256SUMS.txt");
  if (!existsSync(sums)) {
    console.error(`${dir} has no SHA256SUMS.txt — it is not a snapshot this script made.`);
    process.exit(1);
  }
  const expected = readFileSync(sums, "utf8").trim().split("\n").map((line) => ({ sha256: line.slice(0, 64), file: line.slice(66) }));
  let broken = 0;
  for (const { sha256, file } of expected) {
    const full = join(root, file);
    if (!existsSync(full)) { console.error(`MISSING  ${file}`); broken += 1; continue; }
    if ((await hash(full)) !== sha256) { console.error(`MODIFIED ${file}`); broken += 1; }
  }
  console.log(`${expected.length - broken}/${expected.length} files match the snapshot.`);
  if (broken) { console.error(`${broken} file(s) do not. Do not restore from this snapshot.`); process.exit(1); }
}

async function restore(dir) {
  const root = resolve(ROOT, dir);
  const from = join(root, "turiwa");
  if (!existsSync(from)) { console.error(`${dir} holds no database directory.`); process.exit(1); }
  await verify(dir);
  if (await portInUse()) {
    console.error(`The API is answering on port ${PORT}. Stop it before restoring.`);
    process.exit(1);
  }
  if (existsSync(SOURCE)) {
    const aside = `${SOURCE}-replaced-${stamp()}`;
    renameSync(SOURCE, aside);
    console.log(`Kept what was there at ${relative(ROOT, aside)} — delete it once the restore is confirmed.`);
  }
  cpSync(from, SOURCE, { recursive: true });
  console.log(`Restored ${relative(ROOT, from)} into ${relative(ROOT, SOURCE)}.`);
  console.log("Start the API and check the row counts before treating this database as live.");
}

const [flag, arg] = process.argv.slice(2);
if (flag === "--verify" && arg) await verify(arg);
else if (flag === "--restore" && arg) await restore(arg);
else if (flag) { console.error("Usage: node scripts/backup-db.mjs [--verify <dir> | --restore <dir>]"); process.exit(1); }
else await snapshot();
