// Lists shared by the UI and the server. The database has matching check
// constraints (supabase/migrations), so change both together.

export const MAX_DROP_SECONDS = 60;
export const MAX_DROP_BYTES = 100 * 1024 * 1024;
export const DROP_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

// Must match the numbers in supabase/migrations/*_phase3_credits_feedback.sql.
export const CREDITS = {
  welcome: 10,
  perTester: 2,
  feedbackReward: 2,
  helpfulBonus: 1,
  dailyPaidFeedback: 10,
} as const;

export const TESTER_PACKS = [3, 5, 10] as const;

export const WOULD_USE = [
  { slug: "yes", label: "Yes" },
  { slug: "maybe", label: "Maybe" },
  { slug: "no", label: "No" },
] as const;

export const CREDIT_REASONS: Record<string, string> = {
  welcome: "Welcome credits",
  feedback_reward: "Feedback reward",
  feedback_helpful: "Feedback marked helpful",
  testers_requested: "Asked for testers",
  testers_refunded: "Unused tester spots refunded",
  streak_bonus: "4-week testing streak",
  boost: "Boosted an app",
  spotlight: "Booked the Spotlight",
  credit_pack: "Bought credits",
};

// Tester Passport ranks. Must match public.tester_rank() in
// supabase/migrations/*_phase3_grow.sql.
export const TESTER_RANKS = [
  { slug: "new", label: "New tester", given: 0, helpful: 0, perk: "Give feedback to earn stamps" },
  { slug: "scout", label: "Scout", given: 5, helpful: 0, perk: "Scout badge on your profile" },
  { slug: "tester", label: "Tester", given: 15, helpful: 3, perk: "Earn ⚡3 per paid feedback instead of ⚡2" },
  { slug: "pro", label: "Pro Tester", given: 40, helpful: 10, perk: "Earn from 20 feedbacks a day instead of 10" },
  { slug: "trusted", label: "Trusted Tester", given: 100, helpful: 30, perk: "Your feedback shows first to builders" },
] as const;

export type TesterRank = (typeof TESTER_RANKS)[number]["slug"];

export function testerRank(given: number, helpful: number): TesterRank {
  let rank: TesterRank = "new";
  for (const r of TESTER_RANKS) if (given >= r.given && helpful >= r.helpful) rank = r.slug;
  return rank;
}

export const STREAK_BONUS = { weeks: 4, credits: 5 } as const;

// Why you want to connect. Must match the check on public.connections.reason.
export const CONNECT_REASONS = [
  { slug: "collaborate", label: "Collaborate" },
  { slug: "hire", label: "Hire" },
  { slug: "feedback", label: "Get feedback" },
  { slug: "invest", label: "Invest" },
  { slug: "fan", label: "Just a fan" },
] as const;

// The Spotlight: 4 spots in the Featured row, 3 days each, first come first
// served with a line when they're all taken. Must match book_spotlight() in
// supabase/migrations/20261007000000_spotlight.sql.
export const SPOTLIGHT = { slots: 4, days: 3, cost: 25, proCost: 15 } as const;

// Credits you can buy on the website (never turned back into money). Must
// match public.credit_packs().
export const CREDIT_PACKS = [
  { credits: 25, cents: 500 },
  { credits: 60, cents: 1000, note: "20% more" },
  { credits: 150, cents: 2000, note: "Best value" },
] as const;

export const CATEGORIES = [
  { slug: "ai", label: "AI tools" },
  { slug: "productivity", label: "Productivity" },
  { slug: "dev-tools", label: "Dev tools" },
  { slug: "design", label: "Design" },
  { slug: "games", label: "Games" },
  { slug: "finance", label: "Finance" },
  { slug: "education", label: "Education" },
  { slug: "social", label: "Social" },
  { slug: "health", label: "Health" },
  { slug: "other", label: "Other" },
] as const;

export const ROLES = [
  { slug: "founder", label: "Founder" },
  { slug: "employee", label: "Employee" },
  { slug: "looking_for_work", label: "Looking for work" },
  { slug: "hiring", label: "Hiring" },
  { slug: "open_to_collab", label: "Open to collab" },
  { slug: "freelancer", label: "Freelancer" },
] as const;

// The one status people message about (shown as a badge by someone's avatar),
// in order of priority when they've picked more than one.
export const STATUS_ROLES = ["hiring", "looking_for_work", "open_to_collab", "freelancer"] as const;

export function primaryStatus(roles: readonly string[]): (typeof STATUS_ROLES)[number] | null {
  return STATUS_ROLES.find((r) => roles.includes(r)) ?? null;
}

export const PRICING = [
  { slug: "free", label: "Free" },
  { slug: "freemium", label: "Freemium" },
  { slug: "paid", label: "Paid" },
] as const;

export const STAGES = [
  { slug: "idea", label: "Idea" },
  { slug: "beta", label: "Beta" },
  { slug: "launched", label: "Launched" },
] as const;

export type Category = (typeof CATEGORIES)[number]["slug"];
export type Role = (typeof ROLES)[number]["slug"];
export type Pricing = (typeof PRICING)[number]["slug"];
export type Stage = (typeof STAGES)[number]["slug"];

type Option = { readonly slug: string; readonly label: string };

export function labelFor(list: readonly Option[], slug: string): string {
  return list.find((o) => o.slug === slug)?.label ?? slug;
}

export function isOneOf<T extends Option>(list: readonly T[], value: unknown): value is T["slug"] {
  return typeof value === "string" && list.some((o) => o.slug === value);
}

// Phase 4 money rules, in cents. Must match
// supabase/migrations/*_phase4_earn.sql.
export const EARN = {
  tip: { min: 100, max: 50000, feePercent: 5, presets: [300, 500, 1000, 2500] },
  sponsor: { minPrice: 10, maxPrice: 500, minBudget: 1000, maxBudget: 100000, minTries: 10, feePercent: 12, maxRunning: 3 },
  pro: { price: 600, days: 30 },
  payoutMin: 500,
} as const;

export function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${Number.isInteger(dollars) ? dollars.toLocaleString("en-US") : dollars.toFixed(2)}`;
}

// Where a "Try it" tap came from (?via= on /try links). Must match the check
// on public.try_clicks.source.
export const TRY_SOURCES = [
  { slug: "feed", label: "Drops feed" },
  { slug: "page", label: "App page" },
  { slug: "card", label: "Cards on Method V" },
  { slug: "embed", label: "Embeds on other sites" },
  { slug: "sponsor", label: "Sponsor cards" },
  { slug: "api", label: "API" },
  { slug: "share", label: "Shared links" },
  { slug: "app", label: "Mobile app" },
  { slug: "direct", label: "Direct" },
] as const;

export type TrySource = (typeof TRY_SOURCES)[number]["slug"];

// Analytics ranges; more than `free` days is part of Pro.
export const ANALYTICS_RANGES = [7, 30, 90] as const;
export const ANALYTICS_FREE_DAYS = 7;

export const BRAND_LIMITS = { perPerson: 3 } as const;

// Shortest password for email + password accounts (website and mobile app).
export const MIN_PASSWORD = 8;

// The Method V tagline: browser tab title, footer, install description.
export const TAGLINE = "Real apps. Real builders. Real feedback.";

// Method V's own account. Its handle is drawn with the logo's pixel V in
// place of the last letter (see Handle on the website and in the app). The
// name is reserved in the database so nobody else can take it.
export const OFFICIAL_HANDLE = "methodv";
