import { applyRuntimeEnvironment } from "./functions/api/runtime-env";

type WorkerEnv = Record<string, unknown> & {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
};

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    applyRuntimeEnvironment(env);

    const pathname = new URL(request.url).pathname;
    if (pathname === "/api" || pathname.startsWith("/api/")) {
      const { default: handler } = (await import(
        "./functions/api/cloudflare-bundle.mjs"
      )) as {
        default: (request: Request) => Promise<Response>;
      };
      return handler(request);
    }

    return env.ASSETS.fetch(request);
  },
};
