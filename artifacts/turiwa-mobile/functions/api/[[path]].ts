type PagesContext = {
  request: Request;
  env: Record<string, unknown>;
};

type ServiceBinding = {
  fetch(request: Request): Promise<Response>;
};

// Keep a public Worker fallback for Pages hosts where the service binding is not
// available or temporarily fails. Native builds already use this same API origin.
const PUBLIC_API_ORIGIN = "https://turiwa-api.shekinahtundo0.workers.dev";

function targetRequest(request: Request, origin: string): Request {
  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, origin);
  return new Request(target, request.clone());
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const api = context.env.API as ServiceBinding | undefined;
  if (api && typeof api.fetch === "function") {
    // Pages Functions cannot run a Node HTTP server (`node:http` resolves to unenv's stub),
    // so the Express app runs in the `turiwa-api` Worker and is reached over this binding.
    try {
      return await api.fetch(targetRequest(context.request, "https://turiwa-api.internal"));
    } catch (err) {
      console.warn("Pages API service binding failed; trying the public API origin", err);
    }
  }

  try {
    return await fetch(targetRequest(context.request, PUBLIC_API_ORIGIN));
  } catch (err) {
    console.error("Pages API fallback failed", err);
    return new Response(
      JSON.stringify({ message: "Turiwa's API is temporarily unavailable. Please try again." }),
      { status: 502, headers: { "content-type": "application/json; charset=utf-8" } },
    );
  }
}
