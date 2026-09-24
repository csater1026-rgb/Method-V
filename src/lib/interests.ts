// The "For you" feed: what someone's into, and how Drops get ranked for them.
//
// Interests are a score per category, learned from what people do: watching a
// Drop to the end of a few seconds, liking it, trying the app, opening the
// comments, and (signed in) their likes, comments and feedback. Skipping a
// Drop right away counts a little against its category. Signed-out visitors
// keep theirs in a small first-party cookie; nothing else is stored.
//
// No server-only imports, so the mobile app can use the ranking too.

import { CATEGORIES, isOneOf, type Category } from "./constants.ts";

export type Interests = Partial<Record<Category, number>>;

export const INTERESTS_COOKIE = "mv-interests";

// How much each action says about someone's taste.
export const SIGNALS = {
  watched: 1,
  comments: 1.5,
  liked: 3,
  tried: 4,
  feedback: 4,
  skipped: -0.5,
} as const;

// Scores are scaled down when they add up past this, so recent taste
// outweighs old taste and the cookie stays tiny.
const MAX_TOTAL = 60;

// "design:4.5,games:1" -> { design: 4.5, games: 1 }. Anything unexpected is dropped.
export function parseInterests(raw: string | undefined | null): Interests {
  const out: Interests = {};
  if (!raw) return out;
  let text: string;
  try {
    text = decodeURIComponent(raw);
  } catch {
    return out;
  }
  for (const part of text.split(",").slice(0, CATEGORIES.length)) {
    const [cat, value] = part.split(":");
    const n = Number(value);
    if (isOneOf(CATEGORIES, cat) && Number.isFinite(n) && n > 0) out[cat] = Math.min(n, MAX_TOTAL);
  }
  return out;
}

export function serializeInterests(interests: Interests): string {
  return Object.entries(interests)
    .filter(([, n]) => (n ?? 0) > 0.05)
    .map(([cat, n]) => `${cat}:${Math.round((n ?? 0) * 10) / 10}`)
    .join(",");
}

export function bumpInterest(interests: Interests, category: string, amount: number): Interests {
  if (!isOneOf(CATEGORIES, category)) return interests;
  const next: Interests = { ...interests, [category]: Math.max(0, (interests[category] ?? 0) + amount) };
  const total = Object.values(next).reduce((sum, n) => sum + (n ?? 0), 0);
  if (total > MAX_TOTAL) {
    for (const key of Object.keys(next) as Category[]) next[key] = ((next[key] ?? 0) * MAX_TOTAL) / total;
  }
  return next;
}

export function mergeInterests(...sources: Interests[]): Interests {
  const out: Interests = {};
  for (const source of sources) {
    for (const [cat, n] of Object.entries(source) as [Category, number][]) out[cat] = (out[cat] ?? 0) + n;
  }
  return out;
}

export type RankableDrop = {
  id: string;
  owner_id: string;
  like_count: number;
  comment_count: number;
  created_at: string;
  liked?: boolean;
  app: { category: string; try_count: number };
};

export type RankContext = {
  interests?: Interests;
  following?: ReadonlySet<string>;
  viewerId?: string | null;
  now?: number;
};

// A Drop's score: fresh + popular + in the categories this person likes + from
// people they follow. Their own Drops and ones they've already liked sink.
export function scoreDrop(drop: RankableDrop, ctx: RankContext): number {
  const now = ctx.now ?? Date.now();
  const ageHours = Math.max(0, (now - Date.parse(drop.created_at)) / 3_600_000);
  const fresh = 1 / (1 + ageHours / 48);
  const popular = Math.min(1, Math.log10(1 + drop.like_count + 2 * drop.comment_count + drop.app.try_count / 20) / 3);

  const interests = ctx.interests ?? {};
  const top = Math.max(0, ...Object.values(interests).map((n) => n ?? 0));
  const affinity = top > 0 ? (interests[drop.app.category as Category] ?? 0) / top : 0;

  let score = fresh + 0.6 * popular + 1.2 * affinity;
  if (ctx.following?.has(drop.owner_id)) score += 0.8;
  if (drop.liked) score -= 0.5;
  if (ctx.viewerId && drop.owner_id === ctx.viewerId) score -= 1;
  return score;
}

// Best first, but mixed up a little: the same builder twice in a row or the
// same category three times in a row costs a Drop some of its score.
export function rankFeed<T extends RankableDrop>(drops: T[], ctx: RankContext): T[] {
  const left = drops.map((drop) => ({ drop, score: scoreDrop(drop, ctx) }));
  const out: T[] = [];
  while (left.length > 0) {
    const prev = out[out.length - 1];
    const prev2 = out[out.length - 2];
    let best = 0;
    let bestScore = -Infinity;
    left.forEach(({ drop, score }, i) => {
      let s = score;
      if (prev && prev.owner_id === drop.owner_id) s -= 0.35;
      if (prev && prev2 && prev.app.category === drop.app.category && prev2.app.category === drop.app.category) s -= 0.25;
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    });
    out.push(left.splice(best, 1)[0].drop);
  }
  return out;
}

export type RankableQuestion = {
  created_at: string;
  answer_count: number;
  vote_count: number;
  by_builder: boolean;
  poll?: unknown;
  user: { id: string };
  app: { category: string };
};

// The Questions feed: fresh ones and ones still waiting for answers first,
// then builders asking about their own app, polls, and the categories this
// person is into. Their own questions sink.
export function rankQuestions<T extends RankableQuestion>(questions: T[], ctx: RankContext): T[] {
  const now = ctx.now ?? Date.now();
  const interests = ctx.interests ?? {};
  const top = Math.max(0, ...Object.values(interests).map((n) => n ?? 0));
  const score = (q: T) => {
    const ageHours = Math.max(0, (now - Date.parse(q.created_at)) / 3_600_000);
    const affinity = top > 0 ? (interests[q.app.category as Category] ?? 0) / top : 0;
    return (
      1 / (1 + ageHours / 48) +
      0.8 / (1 + q.answer_count) +
      (q.by_builder ? 0.5 : 0) +
      (q.poll ? 0.3 : 0) +
      affinity +
      Math.min(0.5, q.vote_count / 20) -
      (ctx.viewerId && q.user.id === ctx.viewerId ? 1 : 0)
    );
  };
  return [...questions].sort((a, b) => score(b) - score(a));
}
