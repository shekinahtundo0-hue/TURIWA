import { handleAsNodeRequest } from "cloudflare:node";
import { createFetchHandler } from "./fetchHandler";

// Cloudflare Pages Functions hand us a web Request, but Express + serverless-http expect a
// node:http server. `cloudflare:node` lets us run a real node:http server inside a Worker and
// bridge each incoming Request to it. This is the only workerd-compatible path that keeps the
// shared Express app unchanged.

const PORT = 8080;

export default createFetchHandler(async (app) => {
  const { createServer } = await import("node:http");
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.listen(PORT, () => resolve());
    server.on("error", reject);
  });
  return (request: Request) => handleAsNodeRequest(PORT, request);
});
