# Turiwa Mobile

Community savings circles, contributions, and loans — now synced to a live database.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API + database (port 5000)
- `pnpm --filter @workspace/turiwa-mobile run dev` — Expo app
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- Required env: `PORT` (defaults to 5000), `DATABASE_URL` (defaults to embedded PGlite)
- Optional: `EXPO_PUBLIC_API_URL` — API origin the mobile app should call (default `http://localhost:5000`)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM, with PGlite as the zero-setup local database
- Realtime: Server-Sent Events (`GET /api/events`) plus polling fallback
- Validation: Zod, `drizzle-zod`
- Mobile: Expo / React Native

## Where things live

- DB schema: `lib/db/src/schema/`
- DB bootstrap/seed: `lib/db/src/bootstrap.ts`
- API routes: `artifacts/api-server/src/routes/turiwa.ts`
- Mobile data layer: `artifacts/turiwa-mobile/lib/api.ts` and `artifacts/turiwa-mobile/context/TuriwaContext.tsx`

## Architecture decisions

- The mobile app never talks to Postgres directly. It uses the Express API so auth and writes stay on the server.
- PGlite is the default database so the app runs without Docker or a cloud URL. Set `DATABASE_URL=postgres://...` to use real Postgres (including the included Docker Compose file).
- Circles, contributions, and loans are shared live state so every signed-in client sees the same chama activity.

## Product

Turiwa helps groups save together: circles, monthly contributions, and small loans, with a live shared ledger.

## User preferences

Link the Expo app to the working API database rather than device-only AsyncStorage.

## Gotchas

- Start the API before the mobile app or the home screen will show “Connecting…”.
- Android emulator should use `EXPO_PUBLIC_API_URL=http://10.0.2.2:5000`.
- Demo account: phone `+254712345678`, password `demo123`.

## Pointers

- Copy `.env.example` to `.env`
- `docker compose up -d` then set `DATABASE_URL=postgres://turiwa:turiwa@localhost:5432/turiwa` for Postgres
