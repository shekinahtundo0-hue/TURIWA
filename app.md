# Turiwa app and repository guide

This guide describes the checked-in folders and files in this repository and how they fit
together. It is documentation only; the application code and configuration are unchanged.

## What the app is

Turiwa is a savings-circle (chama) ledger. Members use it to manage groups, contributions,
expenses, loans, repayments and statements. The repository is a pnpm monorepo containing:

- an Expo / React Native client in `artifacts/turiwa-mobile` (also exportable for web);
- an Express API in `artifacts/api-server`;
- shared database and API-contract packages under `lib/`;
- a separate UI mockup preview sandbox in `artifacts/mockup-sandbox`.

The mobile app calls the API; it does not connect directly to Postgres. The API uses Drizzle
and can connect to PostgreSQL/Supabase or, for local development, an embedded PGlite database.
Netlify and Vercel have separate function entry points. Cloudflare Workers serves the static
web export and routes API calls through a Worker entry point. Supabase is configured here as a
Postgres host; Firebase/Google handles Google identity sign-in.

## Typical request and startup flow

1. The root `pnpm-workspace.yaml` includes `artifacts/*`, `lib/*` and `scripts`. The root
   package scripts start either the API or Expo client and build shared TypeScript library
   declarations before typechecking packages.
2. The API's `src/index.ts` loads environment variables, opens the database, ensures its
   schema exists, reconciles older loans into the ledger, starts the realtime listener when
   supported, then listens on `PORT` (5000 by default).
3. `src/app.ts` builds the Express middleware stack and mounts the API router at `/api`.
   Routes in `src/routes/` handle authentication, health and savings-circle operations;
   common logic lives in `src/lib/`.
4. The Expo Router app boots through `app/_layout.tsx`, hydrates auth/app state through the
   providers in `context/`, and chooses the welcome or signed-in tabs from `app/index.tsx`.
   `lib/api.ts` sends authenticated requests to the API. In the browser, a deployed app uses
   its own origin; native/local builds can use `EXPO_PUBLIC_API_URL`.
5. A normal Node server can keep a live Postgres listener and send SSE updates. Short-lived
   serverless functions cannot keep an SSE request open, so their `/api/events` route returns
   501 and the client falls back to polling.

## Root files

| Path | Purpose |
| --- | --- |
| `README.md` | Main setup, development, deployment and operational notes. It describes the intended architecture and known limitations. |
| `app.md` | This repository and app configuration guide. |
| `package.json` | Private workspace manifest, root scripts, root-level dependencies and a `preinstall` guard requiring pnpm. `dev` starts the API; `mobile` starts Expo; `typecheck` builds shared declarations and typechecks packages. |
| `pnpm-workspace.yaml` | Defines workspace package locations, shared dependency catalog, minimum package release age, peer-install behavior, native build allowlist and dependency overrides. |
| `pnpm-lock.yaml` | Exact dependency resolution for reproducible pnpm installs. |
| `.npmrc` | Disables automatic peer installation and does not require strict peer-dependency matching. |
| `.env.example` | Example API/database/auth environment variables. Copy to `.env` for local work and replace placeholders with appropriate values. |
| `.gitignore` | Excludes generated files, local environment values, build output and other local-only data from version control. |
| `.replit` | Replit runtime, deployment and post-merge settings. |
| `.replitignore` | Files Replit should omit from its project view/build context. |
| `replit.md` | Replit/project operational notes and architecture description; consult the package manifests for the scripts that actually exist. |
| `tsconfig.base.json` | Shared TypeScript compiler defaults, including strict checks, ES2022 target and bundler-style module resolution. |
| `tsconfig.json` | Root TypeScript project-reference configuration for `lib/db` and generated API client/schema packages. It excludes non-TypeScript brand/UI assets. |
| `docker-compose.yml` | Optional local PostgreSQL 16 service on port 5432, with a named persistent volume. |
| `netlify.toml` | Netlify build base, web export command, function directory, `/api/*` rewrite, SPA fallback, environment defaults and response security headers. |

## `artifacts/api-server` — Express API

This workspace package owns server-side API behavior and supports a normal Node process as
well as host-specific serverless wrappers.

### Package and build files

| Path | Purpose |
| --- | --- |
| `package.json` | API dependencies and commands: `dev` bundles then launches the Node server; `build` creates the Node bundle; `build:netlify` creates a Netlify function; `start` runs the built server; `typecheck` checks the source. |
| `tsconfig.json` | API TypeScript settings, output location and references to the database and Zod contract packages. |
| `.replit-artifact/artifact.toml` | Replit artifact metadata for this package. |
| `build.mjs` | Bundles `src/index.ts` into `dist/index.mjs` with esbuild, sourcemaps, Pino worker support and compatibility shims for CommonJS-style packages. |
| `build-netlify.mjs` | Builds the Netlify API function, writes Netlify redirects/headers into the exported mobile web site, and moves/repoints exported assets whose dot-prefixed pnpm paths would not be published. `EXPORT_ONLY=1` skips the API function bundle for other build flows. |
| `build-vercel.mjs` | Packages the exported static web app and a single Node API function into `artifacts/turiwa-mobile/vercel-deploy`, and writes Vercel rewrites and headers there. |
| `build-cloudflare-api.mjs` | Bundles the Cloudflare API handler separately for the Worker runtime and its `workerd` Postgres export condition. |

### `src/` — server source

| Path | Purpose |
| --- | --- |
| `src/index.ts` | Node server entry point. Loads `.env`, validates `PORT`, initializes the database and ledger, starts realtime support where possible, and listens for HTTP requests. Supports a `--seed-demo` operation. |
| `src/app.ts` | Creates the shared Express application, installs request logging, CORS and body parsing, then mounts the API router at `/api`. |
| `src/fetchHandler.ts` | Shared web-`Request`-to-`Response` handler for serverless hosts. Boots the API lazily, refuses the long-lived SSE route and converts startup/request failures into safe JSON responses. |
| `src/serverlessBoot.ts` | Shared one-time serverless initialization and safe error reporting. Requires a real Postgres database on serverless hosts, initializes without demo seed data, and reconciles loan ledger entries. |
| `src/netlify.ts` | Netlify v2 function adapter. Translates a web `Request` to the AWS-style event expected by `serverless-http`, then returns a web `Response`. |
| `src/vercel.ts` | Vercel Node function adapter. Normalizes rewritten API paths and passes Node request/response objects to Express. |
| `src/cloudflare.ts` | Cloudflare adapter. Creates a Node HTTP server and uses `cloudflare:node` to bridge Worker `Request` objects to Express. |
| `src/netlifyPgliteStub.ts` | Build-time replacement for PGlite in serverless bundles. It prevents the ephemeral embedded database from being used on these hosts. |
| `src/routes/index.ts` | Combines health, authentication and Turiwa business routers. |
| `src/routes/health.ts` | Implements `/api/healthz` and validates its response against the shared health schema. |
| `src/routes/auth.ts` | Authentication/account API: Google sign-in, phone/password sign-in/up, code verification/reset, sign-out, profile/password changes, account deletion and two-factor enrollment/management. |
| `src/routes/turiwa.ts` | Signed-in application API: reads state and events, creates circles and ledger entries, applies for/approves loans and records repayments. |
| `src/routes/` | Express route handlers. |
| `src/lib/.gitkeep` | Keeps the library directory present in version control; the directory also contains API helper modules listed below. |
| `src/middlewares/.gitkeep` | Keeps an otherwise empty middleware directory present. |
| `src/middlewares/` | Reserved for Express middleware; there are no implemented middleware modules here currently. |

### `src/lib/` — server-side helpers

| File | Purpose |
| --- | --- |
| `auth.ts` | Session creation/validation and cleanup, request authentication, one-time code issuance/verification and signup verification. |
| `env.ts` | Loads `.env` values from the working directory or workspace-relative locations without overwriting already-set environment values. |
| `google.ts` | Validates Firebase/Google ID tokens and returns a trusted identity for Google sign-in. |
| `guard.ts` | In-memory failed-login attempt tracking and temporary lockouts. |
| `ids.ts` | Creates IDs and normalizes Kenyan phone-number formats. |
| `liveBus.ts` | Starts a process-local or Postgres `LISTEN/NOTIFY` listener to refresh a user's state in connected clients. |
| `loanLedger.ts` | Records loan disbursements/repayments as ledger rows and backfills ledger entries for existing loans without duplicating them. |
| `loanMath.ts` | Calculates six-month loan quotes, monthly rate, repayment amounts and calendar due dates. |
| `logger.ts` | Configures Pino logging, including log level, development formatting and redaction of authorization/cookie headers. |
| `money.ts` | Shared Kenyan shilling/date formatting helpers for server responses and messages. |
| `realtime.ts` | Tracks per-user SSE connections and delivers or relays state-change notifications. |
| `seedDemo.ts` | Inserts a labelled synthetic demo group and associated sample records when explicitly requested. |
| `store.ts` | Reads the signed-in user's circles, ledger and loans from the database, maps them into app state and publishes state changes. |
| `supabase.ts` | Lazily creates a Supabase client from environment settings. The core app data path uses Postgres through Drizzle rather than app-side PostgREST calls. |
| `totp.ts` | Implements time-based authenticator codes, enrollment URIs, backup-code generation and backup-code verification. |

## `artifacts/turiwa-mobile` — Expo client and web export

This is the primary user interface package. Expo Router maps files under `app/` to screens
and route groups. The same UI targets iOS, Android and web.

### Configuration and package files

| Path | Purpose |
| --- | --- |
| `package.json` | Expo/React Native dependencies and scripts for development, web/Cloudflare build, Replit-style build, static serving and typechecking. |
| `app.json` | Expo app identity, icons/splash, URL schemes, iOS/Android metadata, blocked Android permissions, web favicon and router/typed-route/compiler settings. |
| `eas.json` | EAS development, preview and production build profiles, including Android APK/App Bundle output and deployment API URL values. |
| `metro.config.js` | Starts Metro from Expo's default Metro configuration. |
| `tsconfig.json` | Extends Expo TypeScript settings, enables strict mode and the `@/` path alias, references the shared API client and excludes the unused Supabase helper folder. |
| `wrangler.jsonc` | Cloudflare Worker entry point, static asset directory, SPA fallback, API routing, compatibility settings and non-secret database connection metadata. |
| `.dev.vars.example` | Example local Cloudflare Worker environment file. |
| `.gitignore` | Ignores generated/local Expo and Cloudflare files. |
| `.replit-artifact/artifact.toml` | Replit artifact metadata for the mobile package. |
| `loans-preview.jpg`, `preview-final.jpg`, `sign-in-preview.jpg`, `welcome-preview.jpg` | Screenshots used as visual previews/reference images; they are not app routes or runtime code. |

### `app/` — Expo Router screens

| File/folder | Purpose |
| --- | --- |
| `app/_layout.tsx` | Root provider setup: safe area, error boundary, React Query, gesture/keyboard providers, theme, fonts, splash handling and root navigation stack. |
| `app/index.tsx` | Entry/splash route. Waits for auth hydration and splash completion, then redirects to signed-in tabs or the welcome route. |
| `app/+not-found.tsx` | Fallback screen for unmatched routes. |
| `app/statement.tsx` | Group financial statement screen, including period summary, ledger rows and discrepancy UI/export support. |
| `app/(auth)/_layout.tsx` | Authentication stack layout for welcome, sign-in, sign-up and password recovery. |
| `app/(auth)/welcome.tsx` | Intro/welcome screen and starting point for authentication. |
| `app/(auth)/sign-in.tsx` | Phone/password and available Google sign-in screen. |
| `app/(auth)/sign-up.tsx` | New-account registration flow. |
| `app/(auth)/forgot-password.tsx` | Password reset flow using phone verification. |
| `app/(onboarding)/_layout.tsx` | Onboarding stack layout. |
| `app/(onboarding)/create-group.tsx` | Onboarding screen for creating a savings circle. |
| `app/(tabs)/_layout.tsx` | Responsive signed-in navigation; defines Home, Circles, Loans, Activity and Profile tabs and desktop/compact variants. |
| `app/(tabs)/index.tsx` | Home dashboard with financial summary and shortcuts/attention items. |
| `app/(tabs)/circles.tsx` | Savings circles list and group selection/creation screen. |
| `app/(tabs)/loans.tsx` | Loan application, loan history and repayment screens. |
| `app/(tabs)/activity.tsx` | Activity/ledger view and summary. |
| `app/(tabs)/profile.tsx` | Profile, account/security settings, two-factor controls and account actions. |
| `app/(auth)/`, `app/(onboarding)/`, `app/(tabs)/` | Expo Router route groups. Parentheses group navigation without becoming part of the URL path. |

### `components/` — reusable app UI

| File | Purpose |
| --- | --- |
| `AuthUI.tsx` | Shared authentication layout, headings, fields, buttons and progress indicators. |
| `ErrorBoundary.tsx` | Catches rendering errors in its child tree and presents a fallback. |
| `ErrorFallback.tsx` | Error presentation and recovery action used by the error boundary. |
| `GoogleSignInButton.tsx` | Google sign-in button and separate web/native sign-in flows. |
| `GroupForm.tsx` | Reusable form for group/circle details. |
| `KeyboardAwareScrollViewCompat.tsx` | Keyboard-aware scroll view wrapper to normalize platform behavior. |
| `LoadingScreen.tsx` | Branded splash/loading transition used while auth state is being loaded. |
| `TuriwaLogo.tsx` | Renders the Turiwa mark in React Native UI. |
| `TuriwaUI.tsx` | Shared app design components: screens, headers, buttons, amount/summary rows, circle cards, transaction and notification modals. |

### `context/`, `hooks/`, `lib/`, `constants/` and `utils/`

| Path | Purpose |
| --- | --- |
| `context/TuriwaContext.tsx` | Loads and exposes authentication, API-backed state and finance actions to screens; persists the session token locally and refreshes state. |
| `context/ThemeContext.tsx` | Stores the system/light/dark theme preference in AsyncStorage and provides the resolved theme. |
| `hooks/useColors.ts` | Returns the current theme's color palette for components. |
| `hooks/useResponsive.ts` | Shared responsive-layout sizing/breakpoint helpers. |
| `constants/colors.ts` | Color palettes and semantic colors used by the mobile UI. |
| `lib/api.ts` | API client: endpoint base URL selection, request/auth headers, app data types, money/date/loan helpers, auth and ledger request functions, and state-event subscription with fallback behavior. |
| `lib/firebase.ts` | Firebase Auth initialization/configuration and a check for required public configuration. |
| `lib/googleAuth.ts` | Shared Firebase/Google auth error-code interpretation and Google authentication helpers. |
| `lib/googleAuthNative.ts` | Native Google sign-in configuration and ID-token acquisition hook. |
| `lib/loanMath.ts` | Client-side loan quote calculations used by loan UI. |
| `lib/statement.ts` | Statement/period calculations, group fund summaries and CSV generation/download helpers. |
| `utils/supabase/client.ts` | Legacy Supabase client helper; the folder is excluded from mobile typechecking and is not the current app data path. |
| `utils/supabase/env.ts` | Legacy Supabase environment-value helper. |
| `utils/supabase/middleware.ts` | Legacy Supabase middleware helper. |
| `utils/supabase/server.ts` | Legacy server-side Supabase helper. |

### `assets/`, `functions/`, `scripts/` and `server/`

| Path | Purpose |
| --- | --- |
| `assets/images/icon.png`, `icon_2.png`, `icon-brand.png` | App icon images, including the branded icon referenced in Expo configuration. |
| `assets/images/adaptive-icon.png`, `adaptive-icon-brand.png` | Android adaptive icon images; the branded foreground is configured in `app.json`. |
| `assets/images/splash-mark.png` | Mark used on the native splash screen. |
| `assets/brand/icon/` | Bundled Android adaptive background/foreground and iOS app icon. |
| `assets/brand/logo/` | Dark/light Turiwa mark and monogram SVGs. |
| `functions/api/[[path]].ts` | Cloudflare Pages catch-all API entry retained for Pages deployments; copies runtime configuration into the process and forwards requests to the generated API bundle. |
| `functions/api/runtime-env.ts` | Copies allowlisted Cloudflare runtime variables, including database and Google verification settings, into the Node-compatible Worker process environment. |
| `scripts/build.js` | Replit-oriented Expo build script. Produces platform bundles/manifests and prepares a static-build directory. |
| `scripts/build-cloudflare.mjs` | Exports the web app, builds the Cloudflare API bundle, preserves response headers, removes Pages-only routing files and flattens asset paths Cloudflare would otherwise omit. |
| `worker.ts` | Cloudflare Worker entry point. Routes `/api/*` to the Express API bundle and serves other requests from the exported static app assets. |
| `server/serve.js` | Dependency-free Node server for a generated Expo static build; serves platform manifests, a landing page and static files. |
| `server/templates/landing-page.html` | HTML template used by `server/serve.js` for the Expo landing/download page. |
| `server/` | Supporting code/template for serving the package's generated static native/web build. |

## `artifacts/mockup-sandbox` — design preview tool

This is a separate Vite/React prototype environment. It previews individual mockup components;
it is not the live Expo app or API.

| Path | Purpose |
| --- | --- |
| `package.json` | Vite sandbox commands and React, Tailwind, Radix/shadcn-style UI and preview dependencies. |
| `vite.config.ts` | Configures React/Tailwind plugins, required `PORT` and `BASE_PATH`, preview plugin, alias and Vite server. |
| `tsconfig.json` | TypeScript settings for browser/Vite code and the `@/` source alias. |
| `components.json` | shadcn component-generation conventions and import aliases. |
| `index.html` | HTML entry page and browser metadata/fonts for the mockup canvas. |
| `mockupPreviewPlugin.ts` | Vite plugin that discovers mockup TSX components and generates a lazy import registry, updating it when files change. |
| `.replit-artifact/artifact.toml` | Replit artifact metadata. |
| `src/main.tsx` | React DOM entry point; imports global CSS and renders `App`. |
| `src/App.tsx` | Shows a preview gallery or dynamically loads a component at `/preview/<component-path>`. |
| `src/index.css` | Tailwind imports, theme CSS variables and base styles for the sandbox UI. |
| `src/.generated/mockup-components.ts` | Generated registry of discoverable mockups; currently generated empty until mockup files are present/discovered. |
| `src/components/mockups/LoadingScreen.tsx` | Standalone loading-screen design mockup for preview, separate from the production mobile component. |
| `src/components/ui/` | Reusable generated UI primitives: accordion, alert, alert dialog, aspect ratio, avatar, badge, breadcrumb, button, button group, calendar, card, carousel, chart, checkbox, collapsible, command, context menu, dialog, drawer, dropdown menu, empty state, field, form, hover card, input, input group, OTP input, item, keyboard key, label, menubar, navigation menu, pagination, popover, progress, radio group, resizable panels, scroll area, select, separator, sheet, sidebar, skeleton, slider, Sonner notifications, spinner, switch, table, tabs, textarea, toast, toaster, toggle, toggle group and tooltip. |
| `src/hooks/use-mobile.tsx` | Detects mobile viewport state for sandbox components. |
| `src/hooks/use-toast.ts` | Toast state/hook used by sandbox UI primitives. |
| `src/lib/utils.ts` | Shared class-name and UI utility functions. |

## `lib/` — shared workspace packages

### `lib/db` — database package

| Path | Purpose |
| --- | --- |
| `package.json` | Database package exports, Drizzle/PGlite/Postgres dependencies and `push` commands. |
| `tsconfig.json` | Builds declaration output for the database package as a TypeScript project reference. |
| `drizzle.config.ts` | Loads `.env`, requires a Postgres URL for Drizzle Kit schema push and points migrations/schema discovery at `src/schema/index.ts`. |
| `src/index.ts` | Initializes PGlite or a Postgres pool, ensures schema, hardens hosted schema access and provides password hash/verify helpers and shared exports. |
| `src/client.ts` | Defines the typed Drizzle database client. |
| `src/postgres.ts` | Resolves database URLs from environment values, identifies the driver and configures the Postgres pool/SSL behavior. |
| `src/bootstrap.ts` | Ensures schema objects exist and seeds an empty local database where enabled. |
| `src/harden.ts` | Revokes public/anon/authenticated access to hosted tables and enables row-level security so the browser's Supabase key cannot read ledger data directly. |
| `src/schema/index.ts` | Re-exports all Drizzle table schemas and types. |
| `src/schema/users.ts` | User identities, password hashes, Google identity and two-factor/recovery-code fields. |
| `src/schema/circles.ts` | Savings-circle settings and its JSON member roster. |
| `src/schema/contributions.ts` | Contributions, expenses, repayments and other group ledger entries. |
| `src/schema/loans.ts` | Loan principal, repayment/balance, interest, due-date and ownership/group fields. |
| `src/schema/sessions.ts` | Session tokens, owning users and expiration timestamps. |
| `src/schema/authCodes.ts` | Phone verification/reset codes, attempt counts, verification state and expiry. |
| `src/schema/meta.ts` | Application metadata key/value table. |

### `lib/api-spec`, `lib/api-zod` and `lib/api-client-react`

| Path | Purpose |
| --- | --- |
| `lib/api-spec/package.json` | API specification/code-generation package and Orval command. |
| `lib/api-spec/openapi.yaml` | OpenAPI contract. Currently defines the `/healthz` endpoint and its response schema. |
| `lib/api-spec/orval.config.ts` | Configures Orval to generate a React Query client and Zod schemas from the OpenAPI file. |
| `lib/api-zod/package.json` | Shared generated Zod validation package manifest. |
| `lib/api-zod/tsconfig.json` | TypeScript project-reference settings for generated validation code. |
| `lib/api-zod/src/index.ts` | Public exports for generated schemas. |
| `lib/api-zod/src/generated/api.ts` | Generated API-level Zod schemas. |
| `lib/api-zod/src/generated/types/healthStatus.ts` | Generated health response schema. |
| `lib/api-zod/src/generated/types/index.ts` | Generated type-schema exports. |
| `lib/api-client-react/package.json` | Shared React Query API client package manifest. |
| `lib/api-client-react/tsconfig.json` | TypeScript project-reference settings for generated client code. |
| `lib/api-client-react/src/index.ts` | Public exports for the API client. |
| `lib/api-client-react/src/custom-fetch.ts` | Custom fetch mutator used by generated API operations. |
| `lib/api-client-react/src/generated/api.ts` | Generated React Query hooks and API operations. |
| `lib/api-client-react/src/generated/api.schemas.ts` | Generated request/response TypeScript schemas. |

## Other top-level folders

| Path | Purpose |
| --- | --- |
| `scripts/` | Workspace utilities. `backup-db.mjs` snapshots/verifies/restores the local PGlite data directory with file hashes; `post-merge.sh` installs the frozen workspace lockfile and runs the database push command; `package.json` and `tsconfig.json` define a small utility package; `src/hello.ts` is its sample hello command. |
| `supabase/` | Supabase project configuration and SQL bootstrap. `config.toml` configures the local Supabase CLI project; `setup.sql` creates the listed tables if absent, applies access restrictions, seeds sample rows and adds selected tables to Supabase Realtime publication. The app's current schema lifecycle is also managed by `lib/db`/Drizzle. `.gitignore` excludes local Supabase state. |
| `docs/pilot/` | Pilot planning and evidence documents. `README.md` gives their reading order; `01-inventory.md` records repository/data inventory; `02-security-audit.md` records the audit; `03-workflow-test.md` records workflow testing; `04-interview-kit.md` is the interview guide; `05-priorities.md` ranks pilot priorities; `06-demo-and-onboarding.md` describes the demo/onboarding; `07-pilot-schedule.md` tracks pilot timing and decisions; `08-ui-test-pass.md` records the UI test pass. These are project notes, not runtime configuration. |
| `brand/` | Source brand artwork. `logo/` has dark/light mark and monogram SVGs; `icon/` has Android adaptive icon layers, the iOS app icon and 1x/2x/3x mark PNGs. |
| `ui/` | Standalone web/Tailwind loading-screen design and dark/light mockup images. `loading-screen.tsx` is not imported by the running Expo routes; the live app has its own `artifacts/turiwa-mobile/components/LoadingScreen.tsx`. |
| `attached_assets/` | Attached design reference text (`Pasted-Design-a-complete-cohesive-visual-system-for-Turiwa-a-d_1788944608465.txt`); a source/reference artifact, not executable code. |

## Configuration and deployment notes

- **Local API:** copy `.env.example` to `.env`, install with pnpm, then run `pnpm dev`. The
  database defaults to `pglite://data/turiwa`; setting a Postgres `DATABASE_URL` or the
  documented `SUPABASE_DB_*` values selects a network database.
- **Local client:** `pnpm mobile` starts Expo. A native emulator/device needs an API URL it can
  reach; the Android emulator commonly uses `http://10.0.2.2:5000`, rather than its own
  `localhost`.
- **Cloudflare Workers deployment:** Set the Workers Build root directory to
  `artifacts/turiwa-mobile`, use `cd ../.. && corepack pnpm@10 --filter
  @workspace/turiwa-mobile run build:cloudflare` as the build command, and use
  `npx wrangler deploy` as the deploy command. The root manifest pins pnpm 10 so its workspace
  lockfile configuration is honored. Configure database and Firebase verification values as
  runtime variables/secrets; configure `EXPO_PUBLIC_FIREBASE_*` as build variables because Expo
  compiles them into the web bundle.
- **Netlify/Vercel deployments:** Expo exports the web app to `dist`; the host-specific API
  build scripts bundle the API and write host routing/security files. These serverless API
  bundles require persistent Postgres and deliberately reject embedded PGlite.
- **Public build-time values:** `EXPO_PUBLIC_*` values are compiled into the client bundle.
  Changing those values requires rebuilding/re-exporting the client. Keep server secrets in
  the host's runtime environment and out of the web bundle.
- **Data boundaries:** the app talks to the Express API for application records. Hosted
  serverless deployments need a persistent Postgres database, and the hosted DB setup closes
  direct browser-key table access. The API's ordinary phone verification code flow has no SMS
  sender configured, as documented in the repository README.
- **Generated/native output:** Expo can generate `android/` and `ios/` native projects; they
  are not checked in. Web exports, function bundles, local DB files and typecheck build output
  are generated artifacts rather than the primary source files described above.

## A useful reading order

For the main app configuration, start with `README.md`, `package.json`,
`pnpm-workspace.yaml`, `.env.example` and `netlify.toml`. Follow with
`artifacts/turiwa-mobile/app.json` and `app/_layout.tsx`, then `artifacts/api-server/src/index.ts`
and `src/app.ts`, and finally `lib/db/src/index.ts` plus `lib/db/src/schema/`. That sequence
shows how the workspace starts, how the client is configured, how requests enter the API and
where application data is stored.
