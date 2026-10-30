import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import { mkdir } from "node:fs/promises";

const artifactDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(artifactDir, "..", "turiwa-mobile", "functions", "api");
const outFile = path.join(outDir, "cloudflare-bundle.mjs");

await mkdir(outDir, { recursive: true });

await esbuild({
  entryPoints: [path.resolve(artifactDir, "src", "cloudflare.ts")],
  platform: "node",
  bundle: true,
  format: "esm",
  target: "node20",
  // pg-cloudflare exposes its real TCP socket only through the `workerd` export condition.
  conditions: ["workerd"],
  outfile: outFile,
  outExtension: { ".js": ".mjs" },
  logLevel: "info",
  // The embedded file database is replaced by a stub that refuses to start, so no trace of it
  // stays in the bundle and the function zip stays free of the 10 MB of WebAssembly.
  alias: {
    "@electric-sql/pglite": path.resolve(artifactDir, "src", "netlifyPgliteStub.ts"),
  },
  external: ["pg-native", "cloudflare:node"],
  sourcemap: "linked",
  banner: {
    js: `import { createRequire as __bannerCrReq } from 'node:module';

// Wrangler may bundle this without a real import.meta.url, but createRequire only needs a
// valid file URL to resolve Node built-ins. Use a fallback so the workerd runtime can still
// dynamic-require modules like 'tty'.
const __bannerUrl = typeof import.meta.url === "string" ? import.meta.url : "file:///turiwa-api.mjs";
globalThis.require = __bannerCrReq(__bannerUrl);
    `,
  },
});

console.log(`Cloudflare API bundle written to ${outFile}`);
