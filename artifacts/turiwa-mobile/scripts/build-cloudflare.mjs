import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { readdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";

// The local .env.local points at a developer's localhost. A Pages deployment is
// same-origin, so make that explicit before Expo inlines the API base into the bundle.
process.env.EXPO_PUBLIC_API_URL = "";

const require = createRequire(import.meta.url);
const expoRoot = path.dirname(require.resolve("expo/package.json"));
const expoCli = path.join(expoRoot, "bin", "cli");
const appRoot = path.resolve(import.meta.dirname, "..");

const exported = spawnSync(process.execPath, [expoCli, "export", "--platform", "web"], {
  cwd: appRoot,
  env: process.env,
  stdio: "inherit",
});

if (exported.error) throw exported.error;
if (exported.status !== 0) process.exit(exported.status ?? 1);

// The API is a separate Worker (`artifacts/api-server`), so this export carries no server code.
// Pages only forwards `/api/*` to that Worker over its service binding.

// The Netlify build script still owns the asset rename and security headers. EXPORT_ONLY keeps it
// from producing the Netlify function bundle, which this deploy no longer uses.
const bundled = spawnSync(process.execPath, ["../api-server/build-netlify.mjs"], {
  cwd: appRoot,
  env: { ...process.env, EXPORT_ONLY: "1" },
  stdio: "inherit",
});

if (bundled.error) throw bundled.error;
if (bundled.status !== 0) process.exit(bundled.status ?? 1);

// Pages has its own Function for /api/* and reads `_redirects` differently from Netlify: the
// rule the API build writes proxies to a `.netlify/functions` path that does not exist here.
// Only the SPA fallback ships. `_routes.json` keeps static assets from invoking the Function.
const dist = path.join(appRoot, "dist");
await writeFile(path.join(dist, "_redirects"), "/*    /index.html   200\n", "utf8");
await writeFile(
  path.join(dist, "_routes.json"),
  JSON.stringify({ version: 1, include: ["/api/*"], exclude: [] }, null, 2) + "\n",
  "utf8",
);
await writeFile(
  path.join(dist, ".assetsignore"),
  "_redirects\n_headers\n_routes.json\n",
  "utf8",
);

// Cloudflare's uploader drops every path that contains a `node_modules` segment, and Metro puts
// all 52 exported fonts and icons under `assets/__node_modules/pnpm/<pkg>/node_modules/...`.
// Without this the page publishes, but every font answers with `index.html`. Renaming the
// segments (and the URLs pointing at them) is the whole fix.
const ASSET_URL = /__node_modules\/pnpm\/[^"'`\s)]*/g;
const OLD_PREFIX = "__node_modules/pnpm/";

async function flattenAssetPaths() {
  const assets = path.join(dist, "assets");
  const from = path.join(assets, "__node_modules", "pnpm");
  const to = path.join(assets, "vendor");
  if (await isDirectory(from)) {
    await rename(from, to);
    await renameSegments(to, "node_modules", "packages");
  } else if (!(await isDirectory(to))) {
    throw new Error(`No exported assets found at ${from} - run \`expo export --platform web\` first.`);
  }

  let rewritten = 0;
  for (const full of await textFiles(dist)) {
    const text = await readFile(full, "utf8");
    if (!text.includes(OLD_PREFIX)) continue;
    const next = text.replace(ASSET_URL, (match) =>
      `vendor/${match.slice(OLD_PREFIX.length).replaceAll("/node_modules/", "/packages/")}`,
    );
    if (next === text) continue;
    await writeFile(full, next, "utf8");
    rewritten += 1;
  }

  if (rewritten === 0) {
    throw new Error(`moved assets but no file referenced ${OLD_PREFIX} - the URLs would still point at a skipped path.`);
  }
  console.log(`asset paths flattened for Pages; URLs rewritten in ${rewritten} file(s)`);
}

async function renameSegments(dir, from, to) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const full = path.join(dir, entry.name);
    if (entry.name === from) {
      const target = path.join(dir, to);
      await rename(full, target);
      await renameSegments(target, from, to);
    } else {
      await renameSegments(full, from, to);
    }
  }
}

async function textFiles(dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await textFiles(full)));
    } else if (/\.(?:js|json|html|css|map)$/.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory();
  } catch (err) {
    if (err.code === "ENOENT" || err.code === "ENOTDIR") return false;
    throw err;
  }
}

await flattenAssetPaths();
await rm(path.join(dist, "_redirects"), { force: true });
await rm(path.join(dist, "_routes.json"), { force: true });
