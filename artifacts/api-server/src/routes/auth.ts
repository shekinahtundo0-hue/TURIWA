import { Router, type IRouter } from "express";
import { and, eq, inArray, or } from "drizzle-orm";
import {
  authCodesTable,
  circlesTable,
  contributionsTable,
  getDb,
  hashPassword,
  loansTable,
  sessionsTable,
  usersTable,
  verifyPassword,
  type User,
} from "@workspace/db";
import { newId, normalizePhone } from "../lib/ids";
import { logger } from "../lib/logger";
import { attemptKey, clearFailures, recordFailure, retryAfterSeconds } from "../lib/guard";
import { verifyGoogleIdToken } from "../lib/google";
import {
  createBackupCodes,
  generateTotpSecret,
  matchBackupCode,
  normalizeCode,
  otpauthUri,
  parseBackupCodes,
  verifyTotp,
} from "../lib/totp";
import {
  CODE_NOT_DELIVERED,
  codesVisibleToCaller,
  consumeCode,
  createSession,
  destroySession,
  destroyUserSessions,
  issueCode,
  markCodeVerified,
  requireAuth,
  spendVerifiedCode,
  type AuthedRequest,
} from "../lib/auth";

const router: IRouter = Router();

// Four characters is a PIN, not a password, and this one guards other people's savings.
const MIN_PASSWORD = 8;

function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone ?? null,
    email: user.email ?? null,
    // Google accounts arrive without a password; the UI offers to set one.
    hasPassword: Boolean(user.passwordHash),
    twoFactorEnabled: Boolean(user.twoFactorEnabledAt),
    twoFactorPending: Boolean(user.twoFactorSecret) && !user.twoFactorEnabledAt,
    backupCodesLeft: parseBackupCodes(user.backupCodes).length,
    createdAt: user.createdAt.toISOString(),
  };
}

async function reloadUser(userId: string): Promise<User | undefined> {
  const db = getDb();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return user;
}

// The member proves they hold the authenticator before anything destructive runs.
// A recovery code works too, and is spent when it does.
async function consumeSecondFactor(
  user: User,
  code: string,
  db = getDb(),
): Promise<{ ok: boolean; usedBackupCode: boolean }> {
  const candidate = normalizeCode(code);
  if (!candidate) return { ok: false, usedBackupCode: false };
  if (user.twoFactorSecret && verifyTotp(user.twoFactorSecret, candidate)) {
    return { ok: true, usedBackupCode: false };
  }
  const hashes = parseBackupCodes(user.backupCodes);
  const index = matchBackupCode(hashes, candidate);
  if (index === -1) return { ok: false, usedBackupCode: false };
  const remaining = [...hashes.slice(0, index), ...hashes.slice(index + 1)];
  await db
    .update(usersTable)
    .set({ backupCodes: JSON.stringify(remaining) })
    .where(eq(usersTable.id, user.id));
  return { ok: true, usedBackupCode: true };
}

router.post("/2fa/enroll", requireAuth, async (req, res) => {
  const authed = req as AuthedRequest;
  const user = authed.user!;
  if (user.twoFactorEnabledAt) {
    res.status(409).json({ message: "Two-factor authentication is already switched on." });
    return;
  }
  const secret = generateTotpSecret();
  const db = getDb();
  await db.update(usersTable).set({ twoFactorSecret: secret }).where(eq(usersTable.id, user.id));
  const label = user.phone ?? user.email ?? user.name;
  res.status(201).json({ secret, otpauthUri: otpauthUri(secret, label), accountLabel: label });
});

router.post("/2fa/activate", requireAuth, async (req, res) => {
  const authed = req as AuthedRequest;
  const user = authed.user!;
  if (!user.twoFactorSecret) {
    res.status(400).json({ message: "Ask for a setup key first, then enter the code it generates." });
    return;
  }
  if (!verifyTotp(user.twoFactorSecret, String(req.body?.code ?? ""))) {
    res.status(401).json({ message: "That code is not right or has expired. Try the next one." });
    return;
  }
  const codes = createBackupCodes(10);
  const db = getDb();
  await db
    .update(usersTable)
    .set({
      twoFactorEnabledAt: new Date(),
      backupCodes: JSON.stringify(codes.map((code) => code.hash)),
    })
    .where(eq(usersTable.id, user.id));
  const updated = await reloadUser(user.id);
  logger.info({ userId: user.id }, "Two-factor authentication enabled");
  res.json({ user: publicUser(updated ?? user), backupCodes: codes.map((code) => code.plaintext) });
});

router.post("/2fa/disable", requireAuth, async (req, res) => {
  const authed = req as AuthedRequest;
  const user = authed.user!;
  if (!user.twoFactorEnabledAt) {
    res.status(400).json({ message: "Two-factor authentication is not switched on." });
    return;
  }
  if (user.passwordHash && !verifyPassword(String(req.body?.password ?? ""), user.passwordHash)) {
    res.status(401).json({ message: "Your password is not right. Try again." });
    return;
  }
  const factor = await consumeSecondFactor(user, String(req.body?.code ?? ""));
  if (!factor.ok) {
    res.status(401).json({ message: "Enter the code from your authenticator app or a backup code." });
    return;
  }
  const db = getDb();
  await db
    .update(usersTable)
    .set({ twoFactorSecret: null, twoFactorEnabledAt: null, backupCodes: null })
    .where(eq(usersTable.id, user.id));
  const updated = await reloadUser(user.id);
  logger.info({ userId: user.id }, "Two-factor authentication disabled");
  res.json({ user: publicUser(updated ?? user) });
});

// Permanently removing an account: every group it admined, the contributions
// inside those groups, its loans, its live sessions and the login rows that
// reference it all go in the same request. Nothing is archived.
router.delete("/account", requireAuth, async (req, res) => {
  const authed = req as AuthedRequest;
  const user = authed.user!;
  if (!user.twoFactorEnabledAt) {
    res.status(403).json({
      message: "Turn on two-factor authentication before deleting your account.",
    });
    return;
  }
  if (user.passwordHash && !verifyPassword(String(req.body?.password ?? ""), user.passwordHash)) {
    res.status(401).json({ message: "Your password is not right. Try again." });
    return;
  }
  const factor = await consumeSecondFactor(user, String(req.body?.code ?? ""));
  if (!factor.ok) {
    res.status(401).json({ message: "Enter the code from your authenticator app or a backup code." });
    return;
  }

  const db = getDb();
  const ownedCircles = await db
    .select({ id: circlesTable.id })
    .from(circlesTable)
    .where(eq(circlesTable.createdBy, user.id));
  const circleIds = ownedCircles.map((circle) => circle.id);

  await db
    .delete(contributionsTable)
    .where(
      or(
        eq(contributionsTable.userId, user.id),
        ...(circleIds.length > 0 ? [inArray(contributionsTable.circleId, circleIds)] : []),
      ),
    );
  await db.delete(circlesTable).where(eq(circlesTable.createdBy, user.id));
  await db.delete(loansTable).where(eq(loansTable.userId, user.id));
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, user.id));
  if (user.phone) {
    await db
      .delete(authCodesTable)
      .where(and(eq(authCodesTable.phone, user.phone), or(eq(authCodesTable.purpose, "signup"), eq(authCodesTable.purpose, "reset"))));
  }
  await db.delete(usersTable).where(eq(usersTable.id, user.id));
  logger.info(
    { userId: user.id, circles: circleIds.length, usedBackupCode: factor.usedBackupCode },
    "Account deleted with all data",
  );
  res.status(204).end();
});

router.post("/google", async (req, res) => {
  const idToken = String(req.body?.idToken ?? "");
  let identity;
  try {
    identity = await verifyGoogleIdToken(idToken);
  } catch (err) {
    logger.warn({ reason: err instanceof Error ? err.message : String(err) }, "Google sign-in rejected");
    res.status(401).json({ message: "Google did not verify that sign-in. Please try again." });
    return;
  }

  const db = getDb();
  const [linked] = await db.select().from(usersTable).where(eq(usersTable.googleId, identity.subject)).limit(1);
  let user = linked ?? null;

  if (!user) {
    const [byEmail] = await db.select().from(usersTable).where(eq(usersTable.email, identity.email)).limit(1);
    user = byEmail ?? null;
    if (user) {
      // Same person, two ways in: keep the existing account and link Google to it.
      await db.update(usersTable).set({ googleId: identity.subject }).where(eq(usersTable.id, user.id));
      user = { ...user, googleId: identity.subject };
    }
  }

  if (!user) {
    const id = newId("user");
    await db.insert(usersTable).values({
      id,
      name: identity.name,
      phone: null,
      email: identity.email,
      googleId: identity.subject,
      passwordHash: null,
    });
    const [created] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
    user = created;
  }

  const token = await createSession(user.id);
  res.status(201).json({ user: publicUser(user), token });
});

router.post("/sign-up", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  const password = String(req.body?.password ?? "");
  if (!name || phone.replace(/\D/g, "").length < 9 || password.length < MIN_PASSWORD) {
    res.status(400).json({ message: `Name, phone, and a password of at least ${MIN_PASSWORD} characters are required.` });
    return;
  }

  const db = getDb();
  const existing = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ message: "An account with that phone number already exists. Sign in instead." });
    return;
  }

  // An account is a claim on a phone number, so the claim has to arrive with proof
  // that the number's owner read the code — otherwise anyone could open a Turiwa as
  // somebody else and be sitting inside their groups before the real owner signs up.
  if (!(await spendVerifiedCode(phone, "signup"))) {
    res.status(400).json({
      message: "Confirm the code we texted to " + phone + " before creating your account.",
    });
    return;
  }

  const id = newId("user");
  await db.insert(usersTable).values({
    id,
    name,
    phone,
    passwordHash: hashPassword(password),
  });
  const token = await createSession(id);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, id)).limit(1);
  res.status(201).json({ user: publicUser(user), token });
});

router.post("/sign-in", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  const password = String(req.body?.password ?? "");
  const key = attemptKey("sign-in", req, phone);
  const locked = retryAfterSeconds(key);
  if (locked > 0) {
    res
      .status(429)
      .set("Retry-After", String(locked))
      .json({ message: `Too many wrong passwords. Wait ${Math.ceil(locked / 60)} minute(s) and try again.` });
    return;
  }
  const db = getDb();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
    recordFailure(key);
    res.status(401).json({ message: "Nenosiri si sahihi. Check your phone and password." });
    return;
  }
  clearFailures(key);
  const token = await createSession(user.id);
  res.json({ user: publicUser(user), token });
});

router.post("/sign-out", requireAuth, async (req, res) => {
  const authed = req as AuthedRequest;
  if (authed.sessionToken) {
    await destroySession(authed.sessionToken);
  }
  res.status(204).end();
});

router.get("/me", requireAuth, (req, res) => {
  const authed = req as AuthedRequest;
  res.json({ user: publicUser(authed.user!) });
});

router.post("/otp", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  if (phone.replace(/\D/g, "").length < 9) {
    res.status(400).json({ message: "Enter a valid phone number." });
    return;
  }
  const db = getDb();
  const existing = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (existing.length > 0) {
    res.status(409).json({ message: "An account with that phone number already exists. Sign in instead." });
    return;
  }
  const { code } = await issueCode(phone, "signup", 6);
  if (!codesVisibleToCaller()) {
    logger.warn({ phone, purpose: "signup" }, "Code issued but no message sender is connected");
    res.status(503).json({ message: CODE_NOT_DELIVERED });
    return;
  }
  res.status(201).json({ code, expiresInMinutes: 10, testCode: true });
});

router.post("/otp/verify", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  const code = String(req.body?.code ?? "").trim();
  if (!await markCodeVerified(phone, "signup", code)) {
    res.status(400).json({ message: "Kanuni si sahihi. Check the code and try again." });
    return;
  }
  res.json({ ok: true });
});

router.post("/password/reset-code", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  if (phone.replace(/\D/g, "").length < 9) {
    res.status(400).json({ message: "Enter a valid phone number." });
    return;
  }
  const db = getDb();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  // Whether a number has an account must not be readable from this answer, so both
  // outcomes look the same to the caller.
  if (!user || !codesVisibleToCaller()) {
    if (user) logger.warn({ phone, purpose: "reset" }, "Code issued but no message sender is connected");
    res.json({ ok: true, delivered: false });
    return;
  }
  const { code } = await issueCode(phone, "reset", 6);
  res.json({ ok: true, delivered: true, code, expiresInMinutes: 10 });
});

router.post("/password/reset", async (req, res) => {
  const phone = normalizePhone(String(req.body?.phone ?? ""));
  const code = String(req.body?.code ?? "").trim();
  const password = String(req.body?.password ?? "");
  if (code.length < 4 || password.length < MIN_PASSWORD) {
    res.status(400).json({ message: `Enter the reset code and a new password of at least ${MIN_PASSWORD} characters.` });
    return;
  }
  const db = getDb();
  const [user] = await db.select().from(usersTable).where(eq(usersTable.phone, phone)).limit(1);
  if (!user) {
    res.status(404).json({ message: "No Turiwa account uses that number." });
    return;
  }
  const ok = await consumeCode(phone, "reset", code);
  if (!ok) {
    res.status(400).json({ message: "That code isn't right or has expired. Request a new one." });
    return;
  }
  await db.update(usersTable).set({ passwordHash: hashPassword(password) }).where(eq(usersTable.id, user.id));
  await destroyUserSessions(user.id);
  res.json({ ok: true });
});

router.patch("/profile", requireAuth, async (req, res) => {
  const authed = req as AuthedRequest;
  const name = String(req.body?.name ?? "").trim();
  if (!name) {
    res.status(400).json({ message: "Enter a name for your profile." });
    return;
  }
  const db = getDb();
  await db.update(usersTable).set({ name }).where(eq(usersTable.id, authed.user!.id));
  const [updated] = await db.select().from(usersTable).where(eq(usersTable.id, authed.user!.id)).limit(1);
  res.json({ user: publicUser(updated) });
});

router.post("/password/change", requireAuth, async (req, res) => {
  const authed = req as AuthedRequest;
  const currentPassword = String(req.body?.currentPassword ?? "");
  const newPassword = String(req.body?.newPassword ?? "");
  if (newPassword.length < MIN_PASSWORD) {
    res.status(400).json({ message: `Choose a new password with at least ${MIN_PASSWORD} characters.` });
    return;
  }
  // A Google-only account has no password yet: the first one is set without a
  // current-password check, which is what turns the fallback on.
  if (authed.user!.passwordHash) {
    if (!verifyPassword(currentPassword, authed.user!.passwordHash)) {
      res.status(400).json({ message: "Your current password is not right. Try again." });
      return;
    }
  }
  const db = getDb();
  await db.update(usersTable).set({ passwordHash: hashPassword(newPassword) }).where(eq(usersTable.id, authed.user!.id));
  await destroyUserSessions(authed.user!.id, authed.sessionToken);
  res.json({ ok: true });
});

export default router;
