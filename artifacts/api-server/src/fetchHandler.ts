import type { Express } from "express";
import {
  bootServer,
  DatabaseNotConfigured,
  failedStatement,
  LIVE_UPDATES_REFUSED,
  publicFailureMessage,
} from "./serverlessBoot";

/** How one host hands a web `Request` to the booted Express app and gets a `Response` back. */
export type Dispatch = (request: Request) => Promise<Response>;

function json(statusCode: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status: statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** The request/response contract shared by Netlify and Cloudflare Pages: both call a function
 *  with a web `Request`, and differ only in how that request can reach Express. */
export function createFetchHandler(mount: (app: Express) => Dispatch | Promise<Dispatch>) {
  let dispatching: Promise<Dispatch> | null = null;

  function warmUp() {
    if (!dispatching) {
      dispatching = bootServer().then(mount);
      // The shared boot clears its own cache when opening the database fails; this one has to
      // drop the wrapper too, or a later request would await a promise that already rejected.
      dispatching.catch(() => {
        dispatching = null;
      });
    }
    return dispatching;
  }

  return async function handler(request: Request, _context?: unknown): Promise<Response> {
    // A serverless invocation ends when the handler returns, so a stream that is meant to
    // stay open for hours cannot be served here. Refusing it immediately is what lets the
    // app switch to polling; holding the connection until the function times out would
    // instead stall every screen that opens it.
    if (new URL(request.url).pathname === "/api/events") {
      return json(501, LIVE_UPDATES_REFUSED);
    }

    try {
      const dispatch = await warmUp();
      return await dispatch(request);
    } catch (err) {
      // Keep the public response free of driver internals, but retain the PostgreSQL cause in
      // the host's function logs so a failed Drizzle query can be diagnosed in production.
      if (err instanceof Error) {
        const cause = err.cause instanceof Error ? err.cause : undefined;
        console.error("API handler failed", {
          name: err.name,
          message: failedStatement(err),
          causeName: cause?.name,
          causeMessage: cause?.message,
          causeCode: cause && "code" in cause ? cause.code : undefined,
        });
      }
      // A Drizzle failure message *is* the SQL statement, so echoing it hands every anonymous
      // visitor our table and column layout. `databaseConfigReport` is the one message written to
      // be read by a stranger; everything else goes out as a kind of failure, with the detail in
      // the console.error above.
      // `instanceof` can fail across bundler/Worker boundaries, so use the class name as the
      // reliable marker for the "no database configured" state.
      const noDatabase =
        err instanceof DatabaseNotConfigured ||
        (err instanceof Error && err.name === "DatabaseNotConfigured");
      if (noDatabase) {
        return json(503, err instanceof Error ? err.message : String(err));
      }
      // A deploy variable can turn on raw failure detail for diagnosis. Production never sets
      // it, because a Drizzle message is the SQL statement.
      const wantsDebug =
        process.env.DEBUG_API_ERRORS === "true" &&
        new URL(request.url).searchParams.has("debug");
      if (wantsDebug) {
        const error = err instanceof Error ? err : new Error(String(err));
        const cause = error.cause instanceof Error ? error.cause : undefined;
        return new Response(
          JSON.stringify({
            name: error.name,
            message: error.message,
            causeName: cause?.name,
            causeMessage: cause?.message,
            causeCode: cause && "code" in cause ? cause.code : undefined,
          }),
          { status: 500, headers: { "content-type": "application/json; charset=utf-8" } },
        );
      }
      return json(500, publicFailureMessage(err));
    }
  };
}
