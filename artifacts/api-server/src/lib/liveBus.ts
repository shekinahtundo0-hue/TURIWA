import { databaseDriver, getPool, resolveDatabaseUrl } from "@workspace/db";
import { logger } from "./logger";
import { deliver, setRelay } from "./realtime";
import { getState } from "./store";

type Pool = NonNullable<ReturnType<typeof getPool>>;

// The notification carries only the account id, and each server process then reads
// that account's own state. Keeps the payload tiny and every process authoritative
// about what it is allowed to show.
const CHANNEL = "turiwa_state";

export async function startLiveBus(): Promise<"database" | "single-process"> {
  const url = resolveDatabaseUrl();
  if (databaseDriver(url) === "pglite") {
    // The embedded file database only ever has this one process, so handing the
    // new state straight to the local streams is the whole story.
    return "single-process";
  }
  const pool = getPool();
  if (!pool) return "single-process";

  setRelay(async (userId) => {
    await pool.query("SELECT pg_notify($1, $2)", [CHANNEL, userId]);
  });
  await listen(pool);
  return "database";
}

async function listen(pool: Pool): Promise<void> {
  const client = await pool.connect();
  let reconnecting = false;

  const reconnect = () => {
    if (reconnecting) return;
    reconnecting = true;
    client.release();
    setTimeout(() => {
      void listen(pool).catch((err: unknown) => {
        logger.error({ err }, "Live change listener could not reattach");
      });
    }, 2000);
  };

  client.on("notification", (message) => {
    const userId = message.payload;
    if (!userId) return;
    void getState(userId)
      .then((state) => deliver("state", state, userId))
      .catch((err: unknown) => {
        // The screen keeps its last state; the client also re-polls on its own.
        logger.warn({ err, userId }, "Live refresh read failed");
      });
  });
  client.once("error", reconnect);

  await client.query(`LISTEN ${CHANNEL}`);
  logger.info({ channel: CHANNEL }, "Live change listener attached");
}
