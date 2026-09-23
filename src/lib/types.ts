import type { Category, Pricing, Role, Stage } from "./constants";

export type Profile = {
  id: string;
  username: string;
  display_name: string;
  bio: string;
  roles: Role[];
  skills: string[];
  website_url: string | null;
  x_handle: string | null;
  github_handle: string | null;
  linkedin_url: string | null;
  follower_count: number;
  following_count: number;
  feedback_given_count: number;
  feedback_helpful_count: number;
};

export type ProfileSummary = Pick<Profile, "id" | "username" | "display_name" | "roles">;

export type App = {
  id: string;
  owner_id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  url: string;
  category: Category;
  tech_stack: string[];
  pricing: Pricing;
  stage: Stage;
  try_count: number;
  like_count: number;
  feedback_count: number;
  would_use_yes_count: number;
  rating_sum: number;
  // Launch day starts at launch_at and lasts 24 hours; boosted until boosted_until.
  launch_at: string | null;
  boosted_until: string | null;
  created_at: string;
};

export type Drop = {
  id: string;
  app_id: string;
  owner_id: string;
  video_url: string | null;
  poster_url: string | null;
  duration_seconds: number;
  caption: string;
  like_count: number;
  comment_count: number;
  created_at: string;
};

export type FeedItem = Drop & {
  app: Pick<App, "id" | "slug" | "name" | "tagline" | "category" | "try_count">;
  owner: ProfileSummary;
  liked: boolean;
};

export type AppCard = App & {
  owner: ProfileSummary;
  poster_url: string | null;
};

export type AppDetail = App & {
  owner: ProfileSummary;
  drop: Drop | null;
  liked: boolean;
};

export type Comment = {
  id: string;
  body: string;
  created_at: string;
  user: ProfileSummary;
};

export type Viewer = {
  id: string;
  username: string;
  credits: number;
};

export type TestRequest = {
  slots_total: number;
  slots_filled: number;
};

export type Feedback = {
  id: string;
  would_use: "yes" | "maybe" | "no";
  rating: number;
  worked: string;
  confusing: string;
  earned: number;
  helpful_at: string | null;
  created_at: string;
  user: ProfileSummary;
  // The tester's rank when the builder looks, so Trusted Testers show first.
  user_rank: string;
};

export type FeedbackPanel =
  | { mode: "demo" | "signed-out"; request: TestRequest | null }
  | { mode: "owner"; request: TestRequest | null; feedback: Feedback[]; credits: number }
  | { mode: "tester"; request: TestRequest | null; tried: boolean; mine: Feedback | null };

export type QueueItem = AppCard & { spots_left: number };

export type CreditEvent = {
  id: number;
  delta: number;
  reason: string;
  created_at: string;
  app: { slug: string; name: string } | null;
};

export type Passport = {
  categories: Record<string, number>;
  streak: number;
};

export type TopTester = {
  user_id: string;
  username: string;
  display_name: string;
  feedback_count: number;
  helpful_count: number;
};

export type FeaturedReason = "featured" | "launch" | "boosted" | "hot";
export type FeaturedApp = AppCard & { reason: FeaturedReason };

export type ActionResult = { ok: true } | { ok: false; error: string };
