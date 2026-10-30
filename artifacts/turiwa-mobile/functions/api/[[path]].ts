type PagesContext = {
  request: Request;
  env: Record<string, unknown>;
};

const DB_ENV_NAMES = [
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
];

export async function onRequest(context: PagesContext): Promise<Response> {
  for (const name of DB_ENV_NAMES) {
    const value = context.env[name];
    if (typeof value === "string" && value !== "") {
      process.env[name] = value;
    }
  }

  try {
    const { default: handler } = await import("./cloudflare-bundle.mjs");
    return await (handler as (request: Request) => Promise<Response>)(context.request);
  } catch (err) {
    console.error("Pages API function failed", err);
    return new Response(
      JSON.stringify({ message: "The API could not start on this host." }),
      {
        status: 500,
        headers: { "content-type": "application/json; charset=utf-8" },
      },
    );
  }
}
