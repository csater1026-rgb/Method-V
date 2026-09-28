import "server-only";

import { OFFICIAL_HANDLE } from "./constants";
import { createAdminClient, createClient } from "./supabase/server";
import type { Viewer } from "./types";

// The owner's numbers (/stats): sign-ups, who's active, what's being posted
// and paid for. Read with the secret key, so only the owner may see the page:
// the official @methodv account, or an email listed in OWNER_EMAILS (a
// Vercel setting, comma-separated). Nobody else, and nobody when unset.

export async function isOwner(viewer: Viewer | null): Promise<boolean> {
  if (!viewer) return false;
  if (viewer.username === OFFICIAL_HANDLE) return true;
  const owners = (process.env.OWNER_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (owners.length === 0) return false;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = typeof data?.claims?.email === "string" ? data.claims.email.toLowerCase() : "";
  return !!email && owners.includes(email);
}

const DAY_MS = 24 * 60 * 60 * 1000;
export const STATS_DAYS = 14;

export type Stats = {
  accounts: number;
  newToday: number;
  newWeek: number;
  // Sign-ups per day, oldest first, for the last STATS_DAYS days (UTC).
  daily: { day: string; count: number }[];
  activeWeek: number;
  apps: number;
  appsWeek: number;
  drops: number;
  feedback: number;
  feedbackWeek: number;
  questionsWeek: number;
  answersWeek: number;
  triesWeek: number;
  // Paid, minus refunds, in cents: everything, and by kind (credits, pro, tip...).
  paidCents: number;
  paidByKind: { kind: string; count: number; cents: number }[];
  recent: { username: string; display_name: string; created_at: string }[];
};

export async function getStats(now = Date.now()): Promise<Stats | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  const week = new Date(now - 7 * DAY_MS).toISOString();
  const today = new Date(now);
  today.setUTCHours(0, 0, 0, 0);
  const start = new Date(today.getTime() - (STATS_DAYS - 1) * DAY_MS);

  const count = async (table: string, since?: string) => {
    let q = admin.from(table).select("*", { count: "exact", head: true });
    if (since) q = q.gte("created_at", since);
    const { count: n } = await q;
    return n ?? 0;
  };
  // Who did something this week: tried, liked, gave feedback, asked,
  // answered, followed, posted or messaged.
  const doers = async (table: string, column: string) => {
    const { data } = await admin.from(table).select(column).gte("created_at", week).not(column, "is", null).limit(5000);
    return ((data ?? []) as unknown as Record<string, string>[]).map((r) => r[column]);
  };

  const [accounts, newWeek, apps, appsWeek, drops, feedback, feedbackWeek, questionsWeek, answersWeek, triesWeek, signups, recent, payments, ...active] =
    await Promise.all([
      count("profiles"),
      count("profiles", week),
      count("apps"),
      count("apps", week),
      count("drops"),
      count("feedback"),
      count("feedback", week),
      count("questions", week),
      count("answers", week),
      count("try_clicks", week),
      admin.from("profiles").select("created_at").gte("created_at", start.toISOString()).limit(10000),
      admin.from("profiles").select("username, display_name, created_at").order("created_at", { ascending: false }).limit(10),
      admin.from("payments").select("kind, amount_cents, refund_cents").eq("status", "paid").limit(10000),
      doers("try_clicks", "user_id"),
      doers("likes", "user_id"),
      doers("feedback", "user_id"),
      doers("questions", "user_id"),
      doers("answers", "user_id"),
      doers("follows", "follower_id"),
      doers("apps", "owner_id"),
      doers("drops", "owner_id"),
      doers("messages", "sender_id"),
    ]);

  const daily = Array.from({ length: STATS_DAYS }, (_, i) => ({ day: new Date(start.getTime() + i * DAY_MS).toISOString().slice(0, 10), count: 0 }));
  for (const r of (signups.data ?? []) as { created_at: string }[]) {
    const slot = daily.find((d) => d.day === r.created_at.slice(0, 10));
    if (slot) slot.count++;
  }

  const byKind = new Map<string, { count: number; cents: number }>();
  for (const p of (payments.data ?? []) as { kind: string; amount_cents: number; refund_cents: number }[]) {
    const k = byKind.get(p.kind) ?? { count: 0, cents: 0 };
    k.count++;
    k.cents += p.amount_cents - (p.refund_cents ?? 0);
    byKind.set(p.kind, k);
  }
  const paidByKind = [...byKind].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.cents - a.cents);

  return {
    accounts,
    newToday: daily.at(-1)?.count ?? 0,
    newWeek,
    daily,
    activeWeek: new Set(active.flat()).size,
    apps,
    appsWeek,
    drops,
    feedback,
    feedbackWeek,
    questionsWeek,
    answersWeek,
    triesWeek,
    paidCents: paidByKind.reduce((s, k) => s + k.cents, 0),
    paidByKind,
    recent: (recent.data ?? []) as Stats["recent"],
  };
}
