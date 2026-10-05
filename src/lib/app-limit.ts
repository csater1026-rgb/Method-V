// How many more apps someone can post, and when the next one opens, from the
// times of the apps they posted (APP_LIMIT: 3 every 30 days) and any extra
// app posts they bought in the V Store and haven't used. Plain functions, no
// server code: the phone app uses this too.

// Up to 3 new apps per person every 30 days. Must match limit_new_apps() in
// supabase/migrations/20261020000000_app_limit.sql.
export const APP_LIMIT = { perWindow: 3, days: 30 } as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function appLimit(postedAt: string[], now = Date.now(), extra = 0): { left: number; nextAt: string | null } {
  const windowStart = now - APP_LIMIT.days * DAY_MS;
  const recent = postedAt.map((t) => new Date(t).getTime()).filter((t) => t > windowStart).sort((a, b) => a - b);
  const left = Math.max(APP_LIMIT.perWindow - recent.length, 0) + Math.max(extra, 0);
  // Full: the next slot opens when the oldest of the recent ones turns 30 days old.
  const nextAt = left === 0 ? new Date(recent[recent.length - APP_LIMIT.perWindow] + APP_LIMIT.days * DAY_MS).toISOString() : null;
  return { left, nextAt };
}

// "Nov 4", in US Pacific time (same as the database's message).
export function limitDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
}

export function limitMessage(nextAt: string): string {
  return `You can post ${APP_LIMIT.perWindow} apps every ${APP_LIMIT.days} days. Your next one opens on ${limitDate(nextAt)}. You can still add new Drops to the apps you've posted, or get an extra app post in the V Store.`;
}
