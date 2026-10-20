import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(artifactDir, "../turiwa-mobile/dist");
const outDir = path.resolve(artifactDir, "../turiwa-mobile/vercel-deploy");

// Vercel takes the exported web app as static files and the Express API as one Node function
// that every /api route is rewritten into. Deliberately named without a leading dot: a host
// that refuses to publish anything under a dotted path segment would otherwise upload an empty
// site, which is exactly how the Netlify font bug stayed invisible.
const VERCEL_CONFIG = {
  version: 3,
  framework: null,
  rewrites: [
    { source: "/api/(.*)", destination: "/api/index" },
    { source: "/(.*)", destination: "/index.html" },
  ],
  functions: { "api/index.mjs": { maxDuration: 15 } },
  headers: [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "geolocation=(), camera=(), microphone=()" },
        { key: "X-Frame-Options", value: "DENY" },
      ],
    },
  ],
};

async function buildFunction() {
  const functionsDir = path.join(outDir, "api");
  await removeLocked(functionsDir);
  await mkdir(functionsDir, { recursive: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/vercel.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    target: "node20",
    outfile: path.join(functionsDir, "index.mjs"),
    outExtension: { ".js": ".mjs" },
    logLevel: "error",
    // Same treatment as the Netlify bundle: the embedded file database is replaced by a stub
    // that refuses to start, so a misconfigured deploy reports the missing database instead of
    // failing to load a native Postgres build, and 10 MB of unusable WebAssembly stays out.
    alias: {
      "@electric-sql/pglite": path.resolve(artifactDir, "src/netlifyPgliteStub.ts"),
    },
    external: ["pg-native"],
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

async function copyExport() {
  const entries = await readdir(distDir);
  for (const entry of entries) {
    // Netlify's own routing files. vercel.json says the same thing in Vercel's language.
    if (entry === "_redirects" || entry === "_headers") continue;
    await cp(path.join(distDir, entry), path.join(outDir, entry), { recursive: true });
  }
}

// Windows holds a directory locked for a moment after another process has listed it, and a
// build script that gives up on the first EBUSY leaves yesterday's bundle in the publish folder.
async function removeLocked(target, attempts = 6) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await rm(target, { recursive: true, force: true });
      return;
    } catch (err) {
      if (err.code !== "EBUSY" && err.code !== "EPERM") throw err;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw new Error(`${target} is still locked after ${attempts} attempts - close whatever has it open.`);
}

async function main() {
  // Start from an empty folder: a publish directory that keeps yesterday's bundle alongside
  // today's is how a stale asset survives a deploy that looked completely successful.
  await removeLocked(outDir);
  await mkdir(outDir, { recursive: true });
  await buildFunction();
  await copyExport();
  await writeFile(
    path.join(outDir, "vercel.json"),
    `${JSON.stringify(VERCEL_CONFIG, null, 2)}\n`,
    "utf8",
  );
  console.log(`Vercel deploy folder written to ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
