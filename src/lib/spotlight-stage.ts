// The Spotlight stage on Home (website and phone app): one app on top and
// three under it. Who gets the four spots, in order:
//   1. Paid Spotlights (booked with V Coin), first come first served: the
//      earliest booking that's on now takes the top spot, until its time runs
//      out.
//   2. Every spot still empty goes to "Today's picks": random apps that change
//      every 24 hours (at midnight US Pacific), taking turns so everyone gets
//      seen.
// Anything past four shows in a row under the stage.
//
// While RANDOM_STAGE is on (the owner's choice, until they say otherwise),
// that's all: the team's picks and launch days stay off the stage. Turn it
// off to bring them back after the paid ones, with Today's picks only while
// the "spotlight_fill" promotion is on (public.promotions).
//
// Plain functions, no server code: the phone app imports this too.

export const STAGE_SPOTS = 4;
export const RANDOM_STAGE = true;
const DAY_MS = 24 * 60 * 60 * 1000;

// Days since 1970 in US Pacific time, so the picks change at midnight there.
export function stageDay(now = Date.now()): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(
    new Date(now),
  );
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Math.floor(Date.UTC(get("year"), get("month") - 1, get("day")) / DAY_MS);
}

// A small, stable number for an id (FNV-1a), so the order is random-looking
// but the same for everyone.
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// `count` apps for this day. Every app gets a fixed place in a shuffled line,
// and each day moves down the line by `count`, so the picks change every day
// and nobody repeats until everyone has had a turn.
export function dailyPicks<T extends { id: string }>(pool: T[], count: number, day: number): T[] {
  if (count <= 0 || pool.length === 0) return [];
  const line = [...pool].sort((a, b) => hash(a.id) - hash(b.id) || a.id.localeCompare(b.id));
  const start = (((day * count) % line.length) + line.length) % line.length;
  const out: T[] = [];
  for (let i = 0; i < Math.min(count, line.length); i++) out.push(line[(start + i) % line.length]);
  return out;
}

type Timed = { id: string; boosted_from?: string | null; boosted_until?: string | null };

// Paid Spotlights in the order they started (the first one keeps the top).
export function paidOrder<T extends Timed>(apps: T[]): T[] {
  const start = (a: T) => new Date(a.boosted_from ?? a.boosted_until ?? 0).getTime();
  return [...apps].sort((a, b) => start(a) - start(b) || a.id.localeCompare(b.id));
}

// Puts the groups together in order without repeats.
export function stageOrder<T extends { id: string }, R extends string>(groups: { apps: T[]; reason: R }[], max = 12): (T & { reason: R })[] {
  const seen = new Set<string>();
  const out: (T & { reason: R })[] = [];
  for (const g of groups) {
    for (const a of g.apps) {
      if (seen.has(a.id) || out.length >= max) continue;
      seen.add(a.id);
      out.push({ ...a, reason: g.reason });
    }
  }
  return out;
}

export type StageReason = "boosted" | "featured" | "launch" | "pick";

// The whole stage from its ingredients. `paid` must only hold Spotlights that
// are on now; `fill` is whether the spotlight_fill promotion is on.
export function buildStage<T extends { id: string; poster_url?: string | null; boosted_from?: string | null; boosted_until?: string | null }>(o: {
  paid: T[];
  team: T[];
  launching: T[];
  pool: T[];
  fill: boolean;
  day: number;
}): (T & { reason: StageReason })[] {
  const apps = stageOrder<T, StageReason>([
    { apps: paidOrder(o.paid), reason: "boosted" },
    ...(RANDOM_STAGE
      ? []
      : [
          { apps: o.team, reason: "featured" as const },
          { apps: o.launching, reason: "launch" as const },
        ]),
  ]);
  if ((RANDOM_STAGE || o.fill) && apps.length < STAGE_SPOTS) {
    const taken = new Set(apps.map((a) => a.id));
    const open = o.pool.filter((a) => !taken.has(a.id));
    // Apps with a picture look best on the stage; use the rest only if needed.
    const pictured = open.filter((a) => a.poster_url);
    const need = STAGE_SPOTS - apps.length;
    const picks = dailyPicks(pictured.length >= need ? pictured : open, need, o.day);
    apps.push(...picks.map((a) => ({ ...a, reason: "pick" as const })));
  }
  return apps;
}
