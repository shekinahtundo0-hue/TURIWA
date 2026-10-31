type PagesContext = {
  request: Request;
  env: Record<string, unknown>;
};

type ServiceBinding = {
  fetch(request: Request): Promise<Response>;
};

export async function onRequest(context: PagesContext): Promise<Response> {
  const api = context.env.API as ServiceBinding | undefined;
  if (!api || typeof api.fetch !== "function") {
    return new Response(
      JSON.stringify({ message: "The API binding is missing on this host." }),
      { status: 503, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }

  // Pages Functions cannot run a Node HTTP server (`node:http` resolves to unenv's stub there,
  // so `createServer` throws). The Express app therefore runs in the `turiwa-api` Worker, which
  // does implement it, and this Function forwards to it over a service binding so the app keeps
  // talking to its own origin.
  try {
    const incoming = new URL(context.request.url);
    const target = new URL(incoming.pathname + incoming.search, "https://turiwa-api.internal");
    return await api.fetch(new Request(target, context.request));
  } catch (err) {
    console.error("Pages API proxy failed", err);
    return new Response(
      JSON.stringify({ message: "The API could not be reached from this host." }),
      { status: 502, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }
}
