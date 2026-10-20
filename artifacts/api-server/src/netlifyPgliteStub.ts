// Build-time stand-in for the embedded file database, used only by `build-netlify.mjs`.
//
// The real package ships a compiled Postgres that cannot load in a serverless container,
// and Netlify's dependency tracer would drag it into the function zip just because the
// specifier appears in an import. Replacing it here keeps the bundle self-contained.
//
// Nothing should reach these exports: the function entry refuses to start until
// DATABASE_URL names a Postgres server. If that guard ever fails, this says so.
class Unavailable {
  constructor() {
    throw new Error(
      "This deployment cannot use the embedded file database: it lives on the " +
        "container's disk, which is wiped between requests. Set DATABASE_URL to the " +
        "Supabase Postgres connection string.",
    );
  }
}

export const PGlite = Unavailable;

// drizzle's pglite driver reads its type parsers off this at import time.
export const types: Record<string, unknown> = {};
