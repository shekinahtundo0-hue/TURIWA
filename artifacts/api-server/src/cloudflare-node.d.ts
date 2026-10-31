declare module "cloudflare:node" {
  export function handleAsNodeRequest(
    port: number,
    request: Request,
  ): Response | Promise<Response>;
}
