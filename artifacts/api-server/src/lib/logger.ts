import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";
// pino-pretty runs on a worker thread, which a Worker cannot start. Pages defines
// NODE_ENV as "development" locally, so the runtime has to decide this too.
const onWorker = globalThis.navigator?.userAgent === "Cloudflare-Workers";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(isProduction || onWorker
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
