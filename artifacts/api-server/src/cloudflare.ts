import { handleAsNodeRequest } from "cloudflare:node";
import { createFetchHandler } from "./fetchHandler";

// The API runs on a Cloudflare Worker, not on Pages Functions. Pages serves node:http from
// unenv's stub (`http.createServer is not implemented yet`), so an Express server cannot boot
// there at all; the Worker runtime implements it natively and this module relies on that.
// Pages forwards `/api/*` to this Worker over a service binding (see the Pages function).

const PORT = 8080;

const ENV_NAMES = [
  "DATABASE_URL",
  "SUPABASE_DB_URL",
  "SUPABASE_DATABASE_URL",
  "SUPABASE_DB_HOST",
  "SUPABASE_DB_PORT",
  "SUPABASE_DB_NAME",
  "SUPABASE_DB_USER",
  "SUPABASE_DB_PASSWORD",
  "POSTGRES_PASSWORD",
  "DATABASE_SSL",
  "DATABASE_POOL_MAX",
  "FIREBASE_API_KEY",
  "FIREBASE_PROJECT_ID",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_ANDROID_CLIENT_ID",
  "LOG_LEVEL",
  "DEBUG_API_ERRORS",
];

type WorkerEnv = Record<string, unknown>;

const handler = createFetchHandler(async (app) => {
  const { createServer } = await import("node:http");
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(PORT, () => resolve());
    server.on("error", reject);
  });
  return async (request: Request) => await handleAsNodeRequest(PORT, request);
});

export default {
  async fetch(request: Request, env?: WorkerEnv): Promise<Response> {
    // Bindings arrive on `env`; the shared boot, the Postgres driver and the token verifier all
    // read `process.env`. Copying keeps one configuration path for every host.
    if (env) {
      for (const name of ENV_NAMES) {
        const value = env[name];
        if (typeof value === "string" && value !== "") {
          process.env[name] = value;
        }
      }
      // Hyperdrive holds the Supabase credential and terminates TLS at the origin, where the
      // private CA is installed. The Worker only ever sees a private plaintext socket.
      const hyperdrive = env.HYPERDRIVE as { connectionString?: string } | undefined;
      if (typeof hyperdrive?.connectionString === "string" && hyperdrive.connectionString !== "") {
        process.env.DATABASE_URL = hyperdrive.connectionString;
      }
    }

    return handler(request);
  },
};
