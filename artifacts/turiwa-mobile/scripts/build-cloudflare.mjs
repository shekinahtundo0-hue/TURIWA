import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

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

const bundled = spawnSync(process.execPath, ["../api-server/build-netlify.mjs"], {
  cwd: appRoot,
  env: { ...process.env, CLOUDFLARE_PAGES: "1" },
  stdio: "inherit",
});

if (bundled.error) throw bundled.error;
if (bundled.status !== 0) process.exit(bundled.status ?? 1);
