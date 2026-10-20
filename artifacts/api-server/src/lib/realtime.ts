import type { Response } from "express";

type RealtimeClient = { res: Response; userId: string };

const clients = new Set<RealtimeClient>();

// Set once the server is talking to a real Postgres: a saved change is then announced
// through the database itself, so every API process pushes it to its own open streams.
let relay: ((userId: string) => Promise<void>) | null = null;

export function setRelay(next: (userId: string) => Promise<void>): void {
  relay = next;
}

export function subscribe(res: Response, userId: string): void {
  const client: RealtimeClient = { res, userId };
  clients.add(client);
  res.on("close", () => {
    clients.delete(client);
  });
}

export function deliver(event: string, payload: unknown, userId: string): void {
  const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    if (client.userId === userId) {
      client.res.write(frame);
    }
  }
}

// Every connection is tagged with the account it belongs to, so one user's saved
// data can never be pushed into another user's open stream.
export async function publish(event: string, payload: unknown, userId: string): Promise<void> {
  if (!relay) {
    deliver(event, payload, userId);
    return;
  }
  try {
    await relay(userId);
  } catch {
    // A dropped database hop must not lose the update for this process's screens.
    deliver(event, payload, userId);
  }
}
