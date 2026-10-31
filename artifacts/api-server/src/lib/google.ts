import { X509Certificate, verify as rsaVerify } from "node:crypto";

// Read lazily so loadEnv() has run by the time a request arrives.
function config() {
  return {
    firebaseApiKey: process.env.FIREBASE_API_KEY ?? "",
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "",
    googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
    // The mobile app signs in with an OAuth client of the "Android" type, which is bound
    // to this app's package name and signing key. Google signs the resulting ID token with
    // that client id as the audience, so it has to be trusted separately from the web one.
    googleAndroidClientId: process.env.GOOGLE_ANDROID_CLIENT_ID ?? "",
  };
}

export type GoogleIdentity = {
  subject: string;
  email: string;
  name: string;
  picture: string | null;
};

type TokenPayload = {
  iss?: string;
  aud?: string;
  sub?: string;
  exp?: number | string;
  user_id?: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
  error?: { message?: string };
};

// Google retired the identitytoolkit verifyIdToken endpoint, so tokens are checked
// against Google's published signing certificates the way the Admin SDK does it.
const SIGNING_CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken%40system.gserviceaccount.com";
const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";

let signingCerts: Record<string, string> | null = null;
let signingCertsLoadedAt = 0;

// The sign-in request stays open for as long as these calls do, and the app shows
// "Connecting…" until the API answers. A Google endpoint that never responds must end the
// check, not hang the sign-in.
const OUTBOUND_TIMEOUT_MS = 8_000;

async function fetchWithDeadline(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OUTBOUND_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function loadSigningCerts(): Promise<Record<string, string>> {
  if (signingCerts && Date.now() - signingCertsLoadedAt < 15 * 60 * 1000) return signingCerts;
  const response = await fetchWithDeadline(SIGNING_CERTS_URL);
  if (!response.ok) throw new Error("SIGNING_CERTS_UNAVAILABLE");
  signingCerts = (await response.json()) as Record<string, string>;
  signingCertsLoadedAt = Date.now();
  return signingCerts;
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
}

async function verifySignedToken(idToken: string): Promise<TokenPayload | null> {
  try {
    const [header, payload, signature] = idToken.split(".");
    if (!header || !payload || !signature) return null;
    const jose = decodeSegment(header) as { alg?: string; kid?: string };
    if (jose.alg !== "RS256" || !jose.kid) return null;
    const certificate = (await loadSigningCerts())[jose.kid];
    if (!certificate) return null;
    const signed = Buffer.from(`${header}.${payload}`);
    const valid = rsaVerify(
      "RSA-SHA256",
      signed,
      new X509Certificate(certificate).publicKey,
      Buffer.from(signature, "base64url"),
    );
    if (!valid) return null;
    const claims = decodeSegment(payload) as TokenPayload;
    const expiresAt = Number(claims.exp);
    if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

async function fetchPayload(url: string): Promise<TokenPayload | null> {
  try {
    const response = await fetchWithDeadline(url);
    if (!response.ok) return null;
    return (await response.json()) as TokenPayload;
  } catch {
    return null;
  }
}

// A token only counts as ours when it comes from this project's Firebase Auth, or,
// for the native flow, from Google with the project's own OAuth client as audience.
// Anything else is rejected even if Google signed it.
function isTrustedIssuer(payload: TokenPayload): boolean {
  const { firebaseProjectId, googleClientId, googleAndroidClientId } = config();
  const issuer = String(payload.iss ?? "");
  if (firebaseProjectId && issuer === `https://securetoken.google.com/${firebaseProjectId}`) {
    return payload.aud === firebaseProjectId;
  }
  if (issuer === "https://accounts.google.com" || issuer === "accounts.google.com") {
    const audiences = [googleClientId, googleAndroidClientId].filter(Boolean);
    return audiences.includes(String(payload.aud ?? ""));
  }
  return false;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const { firebaseApiKey, googleClientId, googleAndroidClientId } = config();
  // Fail closed: without a key or client id nothing can be checked, so a token from
  // any Google project would otherwise be accepted as a Turiwa sign-in.
  if (!firebaseApiKey && !googleClientId && !googleAndroidClientId) {
    throw new Error("GOOGLE_AUTH_NOT_CONFIGURED");
  }
  if (!idToken || idToken.length < 20) {
    throw new Error("MISSING_TOKEN");
  }
  const payload =
    (await verifySignedToken(idToken)) ??
    (await fetchPayload(`${TOKENINFO_URL}?id_token=${encodeURIComponent(idToken)}`));
  if (!payload || !payload.sub) {
    throw new Error("INVALID_TOKEN");
  }
  if (!isTrustedIssuer(payload)) {
    throw new Error("TOKEN_AUDIENCE");
  }
  const verified = payload.email_verified === true || payload.email_verified === "true";
  if (!payload.email || !verified) {
    throw new Error("EMAIL_NOT_VERIFIED");
  }
  return {
    subject: String(payload.sub),
    email: payload.email,
    name: String(payload.name ?? payload.email.split("@")[0]),
    picture: payload.picture ? String(payload.picture) : null,
  };
}
