type PagesContext = {
  request: Request;
  env: Record<string, unknown>;
};

import { applyRuntimeEnvironment } from "./runtime-env";

export async function onRequest(context: PagesContext): Promise<Response> {
  applyRuntimeEnvironment(context.env);

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
