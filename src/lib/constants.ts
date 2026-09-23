// Lists shared by the UI and the server. The database has matching check
// constraints (supabase/migrations), so change both together.

export const MAX_DROP_SECONDS = 60;
export const MAX_DROP_BYTES = 100 * 1024 * 1024;
export const DROP_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

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
