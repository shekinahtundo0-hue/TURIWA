import { randomBytes } from "node:crypto";

export function newId(prefix?: string): string {
  const id = `${Date.now().toString(36)}-${randomBytes(4).toString("hex")}`;
  return prefix ? `${prefix}-${id}` : id;
}

export function newJoinCode(): string {
  return randomBytes(8).toString("hex");
}

export function normalizePhone(phone: string): string {
  const trimmed = phone.trim().replace(/[\s-]/g, "");
  if (trimmed.startsWith("0") && trimmed.length >= 9) {
    return `+254${trimmed.slice(1)}`;
  }
  if (trimmed.startsWith("254") && !trimmed.startsWith("+")) {
    return `+${trimmed}`;
  }
  if (!trimmed.startsWith("+") && trimmed.length === 9) {
    return `+254${trimmed}`;
  }
  return trimmed;
}
