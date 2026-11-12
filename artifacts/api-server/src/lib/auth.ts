import { randomBytes, randomInt } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt, isNotNull, lt, ne, sql } from "drizzle-orm";
import { authCodesTable, getDb, sessionsTable, usersTable, type AuthCode, type User } from "@workspace/db";
import { newId } from "./ids";

type AuthTransaction = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
// A short numeric code is guessable, and it is the only thing standing between a
// stranger and someone's group money, so a code dies after five wrong tries and a
// phone cannot ask for a brand new one every second.
const MAX_CODE_ATTEMPTS = 5;
const CODE_RESEND_MS = 60_000;

// Nothing texts a code to a phone yet, so the only way one can reach anyone is this
// response. A build has to declare itself a test build for that to happen, and a
// launched one simply says the code could not be delivered. Read lazily: routes are
// imported before loadEnv() has put .env into the process.
export function codesVisibleToCaller(): boolean {
  return process.env.SHOW_SMS_CODES === "true" && process.env.NODE_ENV !== "production";
}

export const CODE_NOT_DELIVERED =
  "Turiwa cannot text codes right now. Sign in with your password, or connect a message sender to accept new numbers.";

export type AuthedRequest = Request & {
  user?: User;
  sessionToken?: string;
};

function tokenFromRequest(req: Request, allowQuery: boolean): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) {
    const token = header.slice(7).trim();
    if (token) return token;
  }
  // EventSource cannot set a header, so the live stream is the one place a token may
  // arrive in the query string. Everywhere else it must be a header, so a link carrying
  // a session — pasted into a chat, kept in browser history, sent as a referrer —
  // cannot authorise a write.
  if (allowQuery) {
    const query = req.query.token;
    if (typeof query === "string" && query) return query;
  }
  return null;
}

export async function createSession(userId: string): Promise<string> {
  const db = getDb();
  await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, new Date()));
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({ token, userId, expiresAt });
  return token;
}

export async function destroySession(token: string): Promise<void> {
  const db = getDb();
  await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
}

export async function destroyUserSessions(
  userId: string,
  exceptToken?: string,
  db: Pick<ReturnType<typeof getDb>, "delete"> = getDb(),
): Promise<void> {
  if (exceptToken) {
    await db.delete(sessionsTable).where(and(eq(sessionsTable.userId, userId), ne(sessionsTable.token, exceptToken)));
  } else {
    await db.delete(sessionsTable).where(eq(sessionsTable.userId, userId));
  }
}

async function getSessionUser(req: Request, allowQuery = false): Promise<{ user: User; token: string } | null> {
  const token = tokenFromRequest(req, allowQuery);
  if (!token) return null;
  const db = getDb();
  const [session] = await db.select().from(sessionsTable).where(eq(sessionsTable.token, token)).limit(1);
  if (!session) return null;
  if (session.expiresAt.getTime() <= Date.now()) {
    await db.delete(sessionsTable).where(eq(sessionsTable.token, token));
    return null;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, session.userId)).limit(1);
  if (!user) return null;
  return { user, token };
}

function attachSession(req: Request, res: Response, next: NextFunction, session: { user: User; token: string } | null): void {
  if (!session) {
    res.status(401).json({ message: "Sign in to continue." });
    return;
  }
  const authed = req as AuthedRequest;
  authed.user = session.user;
  authed.sessionToken = session.token;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  getSessionUser(req)
    .then((session) => attachSession(req, res, next, session))
    .catch(next);
}

// Only for the live stream, where the browser's EventSource is the client and it
// cannot attach an Authorization header. Reads state; it is never mounted on a write.
export function requireAuthForStream(req: Request, res: Response, next: NextFunction): void {
  getSessionUser(req, true)
    .then((session) => attachSession(req, res, next, session))
    .catch(next);
}

export async function issueCode(
  phone: string,
  purpose: string,
  digits: number,
): Promise<{ code: string | null; retried: boolean }> {
  return getDb().transaction(async (tx) => {
    // A row lock alone cannot serialize two first requests when no row exists yet.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${phone}), hashtext(${purpose}))`);
    const [existing] = await tx
      .select()
      .from(authCodesTable)
      .where(and(eq(authCodesTable.phone, phone), eq(authCodesTable.purpose, purpose)))
      .limit(1)
      .for("update");
    // Preserve exhausted rows through the resend window so a retry cannot reset
    // the guess budget. A verified row holds a private proof, NEVER an SMS code.
    if (
      existing &&
      existing.expiresAt.getTime() > Date.now() &&
      Date.now() - existing.createdAt.getTime() < CODE_RESEND_MS
    ) {
      return { code: existing.verifiedAt ? null : existing.code, retried: true };
    }

    const code = Array.from({ length: digits }, () => String(randomInt(10))).join("");
    await tx.delete(authCodesTable).where(and(eq(authCodesTable.phone, phone), eq(authCodesTable.purpose, purpose)));
    await tx.insert(authCodesTable).values({
      id: newId("code"),
      phone,
      purpose,
      code,
      expiresAt: new Date(Date.now() + CODE_MINUTES * 60 * 1000),
    });
    return { code, retried: false };
  });
}

// Hold this row lock until the enclosing transaction commits the attempt, proof
// replacement or consumption. Verified proofs must never be accepted as OTPs.
async function matchCode(
  phone: string,
  purpose: string,
  code: string,
  tx: AuthTransaction,
): Promise<AuthCode | null> {
  const [row] = await tx
    .select()
    .from(authCodesTable)
    .where(and(eq(authCodesTable.phone, phone), eq(authCodesTable.purpose, purpose)))
    .limit(1)
    .for("update");
  if (!row || row.verifiedAt) return null;
  if (row.expiresAt.getTime() <= Date.now() || row.attempts >= MAX_CODE_ATTEMPTS) return null;
  if (row.code !== code) {
    await tx.update(authCodesTable).set({ attempts: row.attempts + 1 }).where(eq(authCodesTable.id, row.id));
    return null;
  }
  return row;
}

export async function consumeCode(
  phone: string,
  purpose: string,
  code: string,
  tx?: AuthTransaction,
): Promise<boolean> {
  if (!tx) return getDb().transaction((executor) => consumeCode(phone, purpose, code, executor));
  const row = await matchCode(phone, purpose, code, tx);
  if (!row) return false;
  await tx.delete(authCodesTable).where(eq(authCodesTable.id, row.id));
  return true;
}

// Replace the OTP with an unguessable, caller-held proof. Only the request that
// successfully verifies the OTP receives it; account creation spends that proof.
export async function markCodeVerified(phone: string, purpose: string, code: string): Promise<string | null> {
  return getDb().transaction(async (tx) => {
    const row = await matchCode(phone, purpose, code, tx);
    if (!row) return null;
    const verificationToken = randomBytes(32).toString("hex");
    await tx
      .update(authCodesTable)
      .set({ code: verificationToken, verifiedAt: new Date() })
      .where(eq(authCodesTable.id, row.id));
    return verificationToken;
  });
}

export async function spendVerifiedCode(
  phone: string,
  purpose: string,
  verificationToken: string,
  db: Pick<ReturnType<typeof getDb>, "delete"> = getDb(),
): Promise<boolean> {
  // Reject legacy verified numeric codes as well as missing/malformed proofs.
  if (!/^[a-f0-9]{64}$/.test(verificationToken)) return false;
  // DELETE takes a row lock and rechecks its predicate after concurrent writes.
  // The caller passes its transaction so failed account creation restores proof.
  const spent = await db.delete(authCodesTable).where(and(
    eq(authCodesTable.phone, phone),
    eq(authCodesTable.purpose, purpose),
    eq(authCodesTable.code, verificationToken),
    isNotNull(authCodesTable.verifiedAt),
    gt(authCodesTable.expiresAt, new Date()),
  )).returning({ id: authCodesTable.id });
  return spent.length > 0;
}
