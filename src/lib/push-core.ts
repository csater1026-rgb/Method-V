// Pure helpers for push notifications, kept free of server-only imports so
// the unit tests can load them.

import { timingSafeEqual } from "node:crypto";

export type PushRow = {
  id: number;
  user_id: string;
  kind: "follows" | "feedback" | "messages";
  title: string;
  body: string;
  url: string;
};

export type PushMessage = { title: string; body: string; url: string; kind: PushRow["kind"] };

// What a queued push says, and where tapping it goes (a path on the site;
// the app turns it into the matching screen).
export function toMessage(row: PushRow): PushMessage {
  const url = row.url.startsWith("/") && !row.url.startsWith("//") ? row.url : "/";
  return { title: row.title, body: row.body, url, kind: row.kind };
}

// Browser notifications are sent to the address the browser gave when it
// subscribed. Only accept the real push services (Google, Mozilla, Apple,
// Microsoft), so the server can never be pointed anywhere else. Same rule as
// public.is_push_service() in the database.
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];

export function isPushServiceEndpoint(endpoint: unknown): boolean {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.port === "" && !url.username && !url.password && PUSH_HOSTS.some((h) => h.test(url.hostname));
}

// The Supabase Database Webhook sends the shared secret in a header. Constant
// time, and nothing matches when the secret isn't set.
export function secretMatches(given: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Expo's push API answers with one ticket per message, in order. Tokens whose
// app was uninstalled come back as DeviceNotRegistered: those get deleted.
export function deadExpoTokens(tokens: string[], response: unknown): string[] {
  const tickets = (response as { data?: { status?: string; details?: { error?: string } }[] })?.data;
  if (!Array.isArray(tickets)) return [];
  return tokens.filter((_, i) => tickets[i]?.status === "error" && tickets[i]?.details?.error === "DeviceNotRegistered");
}

export function isExpoToken(token: string): boolean {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
}
