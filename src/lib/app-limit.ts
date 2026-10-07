// How many more apps someone can post, and when the next one opens, from the
// times of the apps they posted (APP_LIMIT: 3 every 30 days) and any extra
// app posts they bought in the V Store and haven't used. Plain functions, no
// server code: the phone app uses this too.

// Up to 3 new apps per person every 30 days, and 5 at most with extra posts
// from the V Store. Apps deleted since still count. Must match
// limit_new_apps() in supabase/migrations/20261024000000_economy_fixes.sql.
export const APP_LIMIT = { perWindow: 3, withExtras: 5, days: 30 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

// `capped`: they've posted the most anyone can (5), so extra posts can't help.
export function appLimit(postedAt: string[], now = Date.now(), extra = 0): { left: number; nextAt: string | null; capped: boolean } {
  const windowStart = now - APP_LIMIT.days * DAY_MS;
  const recent = postedAt.map((t) => new Date(t).getTime()).filter((t) => t > windowStart).sort((a, b) => a - b);
  const n = recent.length;
  const saved = Math.max(extra, 0);
  const free = Math.max(APP_LIMIT.perWindow - n, 0);
  const left = Math.min(free + saved, Math.max(APP_LIMIT.withExtras - n, 0));
  const capped = n >= APP_LIMIT.withExtras;
  if (left > 0) return { left, nextAt: null, capped: false };
  // Full: with an extra post saved, the next one opens when they're under 5
  // in the last 30 days; otherwise when they're under 3 again.
  const keep = capped && saved > 0 ? APP_LIMIT.withExtras : APP_LIMIT.perWindow;
  return { left, nextAt: new Date(recent[n - keep] + APP_LIMIT.days * DAY_MS).toISOString(), capped };
}

// "Nov 4", in US Pacific time (same as the database's message).
export function limitDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
}

export function limitMessage(nextAt: string, capped = false): string {
  return capped
    ? `You've posted ${APP_LIMIT.withExtras} apps in the last ${APP_LIMIT.days} days, the most anyone can (${APP_LIMIT.perWindow}, plus ${APP_LIMIT.withExtras - APP_LIMIT.perWindow} extra posts). Your next one opens on ${limitDate(nextAt)}. You can still add new Drops to the apps you've posted.`
    : `You can post ${APP_LIMIT.perWindow} apps every ${APP_LIMIT.days} days. Your next one opens on ${limitDate(nextAt)}. You can still add new Drops to the apps you've posted, or get an extra app post in the V Store.`;
}
