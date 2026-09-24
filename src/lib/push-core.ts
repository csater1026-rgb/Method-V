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
