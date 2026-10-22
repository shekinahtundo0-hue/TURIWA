# Turiwa

A savings-circle (chama) ledger: contributions, expenses, loans and statements for a group of
people who pool money. One pnpm workspace, three deliverables from the same code — a web app,
an Android app, and an API that can run as a server or as a serverless function.

## Layout

| Path | What it is |
| --- | --- |
| `artifacts/turiwa-mobile` | Expo SDK 57 / React Native 0.86 app. Runs on Android, iOS and the web through `react-native-web`. |
| `artifacts/api-server` | Express API. `build-netlify.mjs` bundles it into one Netlify v2 function; a Vercel build is produced the same way. |
| `lib/db` | Drizzle schema and the Postgres connection. The only code that talks to the database. |
| `lib/api-spec`, `lib/api-zod` | The request/response contract shared by the API and its clients. |
| `supabase/setup.sql` | Server-side bootstrap whose job is to keep PostgREST away from members' money. |
| `scripts/backup-db.mjs` | Snapshot / verify / restore the local database with per-file hashes. |
| `brand`, `docs/pilot` | Brand assets and the pilot write-up. |

`android/` and `ios/` are **not** in the repo: `expo prebuild` generates them.

## Setup

Requires pnpm 10 — the workspace's `preinstall` script rejects npm and yarn.

```
cp .env.example .env      # fill in real values; .env is gitignored, keep it that way
pnpm install
pnpm dev                  # API on http://localhost:5000
pnpm mobile               # the app, in a browser or on a device via Expo
```

Leave `SUPABASE_DB_PASSWORD` empty and the API runs on an embedded PGlite database in `data/`,
which is fine for development and useless on a host that can lose its disk. Set the five
`SUPABASE_DB_*` values (or `DATABASE_URL`) to point it at real Postgres. Read `.env.example`
before you change any of them: the pooler host and the `postgres.<project-ref>` username are
both load-bearing, and the plain defaults do not connect.

The API is not a file watcher. After editing its source, rebuild and restart it:
`pnpm --filter @workspace/api-server build`.

```
pnpm typecheck            # builds lib/*.d.ts first, then typechecks every package
```

## Installing dependencies safely

`pnpm-workspace.yaml` sets `minimumReleaseAge: 1440`, so pnpm refuses a package version
published less than a day ago. That is a supply-chain defence. Do not lower it or bypass the
pnpm-only `preinstall` guard to make an install pass.

## Releasing to the web

Order matters: the function bundle writes `_redirects` and `_headers` into the exported site.

```
pnpm --filter @workspace/turiwa-mobile exec expo export --platform web
pnpm --filter @workspace/api-server run build:netlify
npx --yes netlify-cli deploy --prod \
  --dir "$(pwd -W)/dist" --functions "$(pwd -W)/netlify/functions" --no-build
```

Two traps that cost a release each:

- Pass **absolute** paths. A relative `--dir` resolves against the repo root and ignores
  `netlify.toml`'s `base`.
- Without `--functions`, the CLI deploys **zero functions** and only warns in one line. The
  site then serves HTML while every `/api/*` answers 404. Confirm the summary says "and 1
  function".

Sign in to the CLI yourself (`npx --yes netlify-cli login`); nothing here should ever use a
token it was handed.

## Building for Android

```
pnpm --filter @workspace/turiwa-mobile exec expo prebuild --platform android
cd artifacts/turiwa-mobile/android && ./gradlew assembleRelease --no-daemon
```

`eas.json` holds the cloud-build profiles. On Windows two constraints are structural, not
preferences: a Gradle build cannot run from a deep path (CMake and the SDK's `ninja` exceed
`MAX_PATH`, and it fails as "manifest still dirty after 100 tries"), and Gradle needs JDK 17 —
Android Studio's bundled JDK 25 makes AGP's prefab step report a bogus error. Build from a
short root copy of the repo with hoisted `node_modules` and `JAVA_HOME` on Temurin 17.

## How the pieces talk

- Supabase is used **only as Postgres over the wire** — the app never calls PostgREST. Google
  sign-in goes through Firebase; phone-and-password is Turiwa's own API.
- `EXPO_PUBLIC_*` values are inlined when the bundle is built, so changing one means
  re-exporting, not redeploying environment variables.
- A deployed browser calls its **own** origin for `/api`; a localhost browser uses
  `EXPO_PUBLIC_API_URL`. Serverless cannot hold a connection open, so `/api/events` answers 501
  and the client polls instead of using SSE.
- With no database configured, every data endpoint answers **503** and names the missing
  variable. That refusal is intended: a host that cannot persist must not pretend to hold
  someone's money.

## Known limits

State these plainly; do not let the UI imply otherwise.

- **Phone sign-up and password reset cannot deliver a code.** No SMS gateway is wired, so on a
  hosted deployment Google sign-in is the only way a new visitor can create an account.
- **A locally built release APK is debug-signed.** Play needs the certificate EAS signs with, and
  its SHA-1 must be the one registered on the Google OAuth client.
- Member management, terms acceptance and month-close reporting are unfinished work, tracked in
  the issue list rather than in the code.
