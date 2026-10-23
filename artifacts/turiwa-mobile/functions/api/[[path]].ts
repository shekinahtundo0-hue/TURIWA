type PagesContext = {
  request: Request;
  env: Record<string, string | undefined>;
};

type ApiHandler = (request: Request, context: { request: Request }) => Promise<Response>;

const runtime = globalThis as typeof globalThis & {
  process: { env: Record<string, string | undefined> };
};

export async function onRequest(context: PagesContext): Promise<Response> {
  // Cloudflare exposes Pages bindings on the request context. The existing API bundle
  // reads process.env, so bridge only the runtime variables it already understands.
  for (const name of [
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
    "SUPABASE_URL",
    "SUPABASE_PUBLISHABLE_KEY",
  ]) {
    const value = context.env[name];
    if (value !== undefined) runtime.process.env[name] = value;
  }

  const { default: handle } = (await import("../../netlify/functions/api.mjs")) as {
    default: ApiHandler;
  };

  return handle(context.request, { request: context.request });
}
