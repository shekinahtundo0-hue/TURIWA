import serverless from "serverless-http";
import { bootServer, DatabaseNotConfigured, LIVE_UPDATES_REFUSED } from "./serverlessBoot";

// Netlify invokes this once per request and may freeze the container afterwards, so there is
// no `app.listen` here. The database work that normally happens at startup lives in
// serverlessBoot, shared with the Vercel function so the two hosts cannot drift apart.

/** What `serverless-http` answers with: the AWS-shaped half of a response, which the
 *  v2 contract only accepts once it has been turned into a real `Response`. */
type NetlifyResult = {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
};

/** The subset of the v2 function context this file passes through. */
type NetlifyContext = { request: Request; next?: () => Promise<Response> };

/** `serverless-http` is written against the AWS API Gateway event, whose request path,
 *  client address and body encoding differ from the web `Request` Netlify hands a v2
 *  function. Left as they come, the framework would route to
 *  `/.netlify/functions/api/...` — a path the Express app has no route for. */
async function toApiGatewayEvent(request: Request): Promise<Record<string, unknown>> {
  const url = new URL(request.url);
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  return {
    httpMethod: request.method,
    path: url.pathname,
    headers,
    // The API accepts JSON and form bodies only, so text is a faithful encoding here and
    // avoids making Express unwrap a base64 payload it never asked for.
    body: request.method === "GET" || request.method === "HEAD" ? "" : await request.text(),
    isBase64Encoded: false,
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    requestContext: { identity: { sourceIp: headers["client-ip"] ?? "" } },
  };
}

function toResponse(result: NetlifyResult): Response {
  return new Response(result.body, {
    status: result.statusCode,
    headers: result.headers,
  });
}

function json(statusCode: number, message: string): Response {
  return new Response(JSON.stringify({ message }), {
    status: statusCode,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

let handling: Promise<(event: object, context: object) => Promise<NetlifyResult>> | null = null;

function warmUp() {
  if (!handling) {
    handling = bootServer().then(
      (app) =>
        serverless(app, { provider: "aws" }) as (
          event: object,
          context: object,
        ) => Promise<NetlifyResult>,
    );
    // The shared boot clears its own cache when opening the database fails; this one has to
    // drop the wrapper too, or a later request would await a promise that already rejected.
    handling.catch(() => {
      handling = null;
    });
  }
  return handling;
}

export default async function handler(
  request: Request,
  _context: NetlifyContext,
): Promise<Response> {
  // A serverless invocation ends when the handler returns, so a stream that is meant to
  // stay open for hours cannot be served here. Refusing it immediately is what lets the
  // app switch to polling; holding the connection until the function times out would
  // instead stall every screen that opens it.
  if (new URL(request.url).pathname === "/api/events") {
    return json(501, LIVE_UPDATES_REFUSED);
  }

  try {
    const handle = await warmUp();
    return toResponse(await handle(await toApiGatewayEvent(request), {}));
  } catch (err) {
    const message =
      err instanceof DatabaseNotConfigured
        ? err.message
        : err instanceof Error
          ? `API request failed: ${err.message}`
          : "API request failed";
    return json(err instanceof DatabaseNotConfigured ? 503 : 500, message);
  }
}
