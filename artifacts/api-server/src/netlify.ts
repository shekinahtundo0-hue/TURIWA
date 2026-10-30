import serverless from "serverless-http";
import { createFetchHandler } from "./fetchHandler";

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

export default createFetchHandler((app) => {
  const handle = serverless(app, { provider: "aws" }) as (
    event: object,
    context: object,
  ) => Promise<NetlifyResult>;
  return async (request) => toResponse(await handle(await toApiGatewayEvent(request), {}));
});
