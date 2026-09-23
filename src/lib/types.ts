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
  connection_count: number;
  reputation: number;
  // Phase 4. Pro while pro_until is in the future.
  pro_until: string | null;
  pinned_app_id: string | null;
  payouts_enabled: boolean;
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
  backer_count: number;
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
  // Boost Exchange: the app paying for a card on this app's Drops.
  sponsor: SponsorCard | null;
};

export type AppCard = App & {
  owner: ProfileSummary;
  poster_url: string | null;
};

export type AppDetail = App & {
  owner: ProfileSummary;
  drop: Drop | null;
  liked: boolean;
  sponsor: SponsorCard | null;
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

export type Update = {
  id: string;
  body: string;
  created_at: string;
  user: ProfileSummary;
  app: { slug: string; name: string } | null;
};

export type SwapApp = { id: string; slug: string; name: string; owner_id: string };

export type Swap = {
  id: string;
  kind: "swap" | "colaunch";
  status: "pending" | "accepted" | "declined" | "ended";
  launch_at: string | null;
  created_at: string;
  from: SwapApp;
  to: SwapApp;
};

export type Notification = {
  id: number;
  kind: string;
  created_at: string;
  read_at: string | null;
  ref_id: string | null;
  actor: ProfileSummary | null;
  app: { slug: string; name: string } | null;
};

export type ConnectionRequest = {
  id: string;
  reason: string;
  note: string;
  created_at: string;
  person: ProfileSummary;
};

// How the viewer stands with someone.
export type ConnectionState =
  | { status: "none" }
  | { status: "sent"; id: string }
  | { status: "received"; id: string; reason: string; note: string }
  | { status: "connected"; id: string }
  | { status: "declined" };

export type Message = { id: string; body: string; created_at: string; mine: boolean; read_at: string | null };

export type Conversation = { person: ProfileSummary; last: Message; unread: number };

export type InboxCounts = { notifications: number; messages: number; requests: number };

export type Answer = {
  id: string;
  body: string;
  created_at: string;
  vote_count: number;
  voted: boolean;
  user: ProfileSummary;
};

export type Question = {
  id: string;
  body: string;
  created_at: string;
  vote_count: number;
  voted: boolean;
  best_answer_id: string | null;
  user: ProfileSummary;
  answers: Answer[];
};

export type Suggestion = ProfileSummary & { shared_categories: string[]; shared_skills: string[] };

export type FeaturedReason = "featured" | "launch" | "boosted" | "hot";
export type FeaturedApp = AppCard & { reason: FeaturedReason };

export type ActionResult = { ok: true } | { ok: false; error: string };

// ---------------------------------------------------------------------------
// Phase 4: Earn
// ---------------------------------------------------------------------------

export type JobKind = "hiring" | "gig" | "looking";

export type Job = {
  id: string;
  kind: JobKind;
  title: string;
  body: string;
  pay: string;
  location: string;
  remote: boolean;
  skills: string[];
  status: "open" | "closed";
  application_count: number;
  expires_at: string;
  created_at: string;
  user: ProfileSummary;
  app: { slug: string; name: string } | null;
};

export type JobApplication = {
  id: string;
  note: string;
  status: "new" | "shortlisted" | "passed";
  created_at: string;
  user: ProfileSummary;
  app: { slug: string; name: string } | null;
};

// A "Sponsored by" card shown on the host app and its Drops.
export type SponsorCard = { id: string; slug: string; name: string; tagline: string };

export type SponsorshipStatus = "offered" | "accepted" | "declined" | "active" | "completed" | "ended";

export type Sponsorship = {
  id: string;
  status: SponsorshipStatus;
  price_cents: number;
  budget_cents: number;
  spent_cents: number;
  tries: number;
  message: string;
  created_at: string;
  started_at: string | null;
  sponsor: { id: string; slug: string; name: string } | null;
  host: { id: string; slug: string; name: string } | null;
  mine: "sponsor" | "host";
};

export type Backer = { id: string; note: string; created_at: string; user: ProfileSummary };

export type EarningEvent = { id: number; delta_cents: number; kind: string; created_at: string; app: { slug: string; name: string } | null };

export type Earnings = {
  balance: number;
  events: EarningEvent[];
  payouts: { id: string; amount_cents: number; status: string; created_at: string }[];
  account: "none" | "pending" | "ready";
  pro_until: string | null;
};

export type Challenge = {
  id: string;
  slug: string;
  title: string;
  body: string;
  sponsor_name: string;
  sponsor_url: string | null;
  prize: string;
  stack: string | null;
  category: string | null;
  starts_at: string;
  ends_at: string;
  winner_entry_id: string | null;
  entry_count: number;
};

export type ChallengeEntry = { id: string; vote_count: number; app: AppCard };

export type AppStat = { day: string; tries: number; sponsored: number };
