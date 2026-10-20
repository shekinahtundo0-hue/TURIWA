import type { IncomingMessage, ServerResponse } from "node:http";
import type { Express } from "express";
import { bootServer, DatabaseNotConfigured, LIVE_UPDATES_REFUSED } from "./serverlessBoot";

// Vercel's Node function contract is the one Express already speaks: a request and a response
// object, with the invocation ending when the handler returns. So unlike the Netlify wrapper
// there is no event translation to do — only the route, which the rewrite hides, and the two
// refusals a short-lived container has to make.

/** Every `/api/...` call is rewritten into this single file, and depending on how the rewrite
 *  is written the function receives either the original path or the rewritten one that names
 *  the file. Both reduce to the route Express declares, so a change in routing config cannot
 *  silently turn the whole API into 404s. */
export function apiRoute(url: string): string {
  const [path = "", search = ""] = url.split("?");
  const named = path.lastIndexOf("/index");
  const rest = named === -1 ? path : path.slice(named + "/index".length);
  return `${rest.startsWith("/api") ? rest : `/api${rest}`}${search ? `?${search}` : ""}`;
}

function refuse(res: ServerResponse, statusCode: number, message: string): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ message }));
}

let serving: Promise<Express> | null = null;

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const route = apiRoute(req.url ?? "/");

  // Same reason as on Netlify: a stream meant to stay open for hours cannot survive an
  // invocation that ends the moment this function returns. The app sees 501 and polls.
  if (route === "/api/events") {
    refuse(res, 501, LIVE_UPDATES_REFUSED);
    return;
  }

  try {
    serving = serving ?? bootServer();
    const app = await serving;
    req.url = route;
    // An Express app is itself a `(req, res)` listener, so there is nothing to adapt.
    await app(req, res);
  } catch (err) {
    if (err instanceof DatabaseNotConfigured) {
      refuse(res, 503, err.message);
      return;
    }
    // A failed boot must not be remembered: the next invocation tries the database again, so
    // a briefly unreachable Postgres heals without a redeploy.
    serving = null;
    refuse(res, 500, `API request failed: ${err instanceof Error ? err.message : "unknown error"}`);
  }
}
