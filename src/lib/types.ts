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
};

export type ActionResult = { ok: true } | { ok: false; error: string };
