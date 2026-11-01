import Constants from 'expo-constants';
import type { Href } from 'expo-router';

export function normalizeCircleInviteCode(value: string | string[] | undefined): string | undefined {
  const code = Array.isArray(value) ? value[0] : value;
  const normalized = code?.replace(/\s/g, '').toLowerCase();
  return normalized && /^[a-f0-9]{16}$/.test(normalized) ? normalized : undefined;
}

export function circleInviteHref(code: string | undefined): Href | null {
  return code ? (`/join-circle?code=${encodeURIComponent(code)}` as Href) : null;
}

export function circleInviteUrl(code: string): string {
  const publicAppUrl = Constants.expoConfig?.extra?.publicAppUrl;
  if (typeof publicAppUrl !== 'string' || !publicAppUrl) {
    throw new Error('The public app URL is not configured.');
  }
  return `${publicAppUrl.replace(/\/+$/, '')}/join-circle?code=${encodeURIComponent(code)}`;
}
