// "Builders like you" puts people you have something in common with first
// (same app categories, likes, tests or skills). On a young site that's often
// nobody, so the row tops up with the newest builders you don't follow yet.
// Shared by the website and the phone app.

export const SUGGESTION_LIMIT = 8;

export function topUpSuggestions<T extends { id: string }>(
  matched: T[],
  newest: T[],
  skip: Iterable<string>,
  limit = SUGGESTION_LIMIT,
): T[] {
  const seen = new Set<string>(skip);
  const out: T[] = [];
  for (const p of [...matched, ...newest]) {
    if (out.length >= limit) break;
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    out.push(p);
  }
  return out;
}

// New accounts start as builder_<10 characters> until they pick a username.
const PLACEHOLDER = /^builder_[0-9a-f]{10}$/;

// Newest builders to fill with, the ones who've set up a profile first (a
// real username); brand-new placeholder accounts go last, not away, so a
// young site still shows everyone.
export function setUpFirst<T extends { username: string }>(people: T[]): T[] {
  return [...people.filter((p) => !PLACEHOLDER.test(p.username)), ...people.filter((p) => PLACEHOLDER.test(p.username))];
}
