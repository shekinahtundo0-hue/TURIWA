import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hashPassword, verifyPassword } from "@workspace/db";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const DIGITS = 6;
// Authenticator apps and phones rarely agree to the second, so accept the
// previous and next window as well.
const WINDOW_STEPS = 1;

function base32Encode(bytes: Buffer): string {
  let value = 0;
  let bits = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(input: string): Buffer {
  let value = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const character of input.toUpperCase()) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index === -1) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function totpCode(secret: string, at: Date): string {
  const counter = Math.floor(at.getTime() / 1000 / STEP_SECONDS);
  const block = Buffer.alloc(8);
  block.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac("sha1", base32Decode(secret)).update(block).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(DIGITS, "0");
}

export function normalizeCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase();
}

export function verifyTotp(secret: string, code: string): boolean {
  const candidate = normalizeCode(code);
  if (!/^\d{6}$/.test(candidate)) return false;
  const now = Date.now();
  for (let step = -WINDOW_STEPS; step <= WINDOW_STEPS; step += 1) {
    const expected = Buffer.from(totpCode(secret, new Date(now + step * STEP_SECONDS * 1000)));
    if (expected.length === candidate.length && timingSafeEqual(expected, Buffer.from(candidate))) {
      return true;
    }
  }
  return false;
}

export function otpauthUri(secret: string, accountLabel: string): string {
  const secret_ = encodeURIComponent(secret);
  return `otpauth://totp/${encodeURIComponent(`Turiwa:${accountLabel}`)}?secret=${secret_}&issuer=Turiwa&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

export type BackupCode = { plaintext: string; hash: string };

// Formatted as XXXX-XXXX so it can be read out over the phone without ambiguity.
function newBackupCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(8);
  const characters = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]);
  return `${characters.slice(0, 4).join("")}-${characters.slice(4).join("")}`;
}

export function createBackupCodes(count = 10): BackupCode[] {
  return Array.from({ length: count }, () => {
    const plaintext = newBackupCode();
    // Stored without the separator so a typed or read-out code matches either way.
    return { plaintext, hash: hashPassword(normalizeCode(plaintext)) };
  });
}

export function parseBackupCodes(stored: string | null): string[] {
  if (!stored) return [];
  try {
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

// Returns the index of the hash that matched, or -1.
export function matchBackupCode(hashes: string[], code: string): number {
  const candidate = normalizeCode(code);
  if (/^\d{6}$/.test(candidate)) return -1;
  return hashes.findIndex((hash) => {
    try {
      return verifyPassword(candidate, hash);
    } catch {
      return false;
    }
  });
}
