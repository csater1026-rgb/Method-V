import "server-only";

import { NextResponse } from "next/server";

import { clientFromBearer } from "./supabase/bearer";
import { isSupabaseConfigured, publicFileUrl } from "./supabase/env";
import { createClient } from "./supabase/server";
import type { AppCard, AppDetail, Challenge, Profile } from "./types";

// The read-only API (/api/v1), for members only, like the site itself: the
// caller must be signed in to Method V (the site's sign-in cookie), or send
// their sign-in token as "Authorization: Bearer <token>" (see memberOnly).
// Nothing private (feedback, earnings, messages) is ever included. Answers
// are never cached, so one member's answer can't be handed to anyone else.

const HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "private, no-store",
  Vary: "Authorization, Cookie",
  "X-Content-Type-Options": "nosniff",
};

export const MEMBERS_ONLY_MESSAGE =
  "Method V's API is for members. Sign in at methodv.app, or send your sign-in token as \"Authorization: Bearer <token>\".";

// Null when the caller is a signed-in member (go ahead), else the 401 to send.
// Demo mode has no accounts, so it's open there.
export async function memberOnly(request: Request): Promise<NextResponse | null> {
  if (!isSupabaseConfigured) return null;
  if (request.headers.get("authorization")) {
    if (await clientFromBearer(request)) return null;
  } else {
    const { data } = await (await createClient()).auth.getClaims();
    if (data?.claims?.sub) return null;
  }
  return apiError(MEMBERS_ONLY_MESSAGE, 401);
}

export function apiJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: HEADERS });
}

export function apiError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: HEADERS });
}

export function apiOptions() {
  return new NextResponse(null, { status: 204, headers: HEADERS });
}

export function apiOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return configured ? configured.replace(/\/$/, "") : new URL(request.url).origin;
}

// Links go through /try with ?via=api, so tries from API users are counted
// (and show up as "API" in the builder's analytics).
export function publicApp(app: AppCard | AppDetail, origin: string) {
  const drop = "drop" in app ? app.drop : null;
  return {
    slug: app.slug,
    name: app.name,
    tagline: app.tagline,
    description: app.description,
    category: app.category,
    tech_stack: app.tech_stack,
    pricing: app.pricing,
    stage: app.stage,
    page_url: `${origin}/apps/${app.slug}`,
    try_url: `${origin}/try/${app.slug}?via=api`,
    embed_url: `${origin}/embed/${app.slug}`,
    // The app's cover image when it has one, like its card on the site.
    poster_url: "poster_url" in app ? app.poster_url : (publicFileUrl(app.cover_path ?? null) ?? drop?.poster_url ?? null),
    // Its square logo, if the builder added one.
    logo_url: publicFileUrl(app.logo_path ?? null),
    drop: drop ? { video_url: drop.video_url, poster_url: drop.poster_url, duration_seconds: drop.duration_seconds, caption: drop.caption } : undefined,
    stats: {
      tries: app.try_count,
      likes: app.like_count,
      backers: app.backer_count,
      testers: app.feedback_count,
      would_use_percent: app.feedback_count ? Math.round((app.would_use_yes_count / app.feedback_count) * 100) : null,
      rating: app.feedback_count ? Math.round((app.rating_sum / app.feedback_count) * 10) / 10 : null,
    },
    builder: { username: app.owner.username, display_name: app.owner.display_name, url: `${origin}/u/${app.owner.username}` },
    created_at: app.created_at,
  };
}

export function publicProfile(p: Profile, origin: string) {
  return {
    username: p.username,
    display_name: p.display_name,
    bio: p.bio,
    roles: p.roles,
    skills: p.skills,
    url: `${origin}/u/${p.username}`,
    links: { website: p.website_url, x: p.x_handle, github: p.github_handle, linkedin: p.linkedin_url },
    stats: {
      followers: p.follower_count,
      connections: p.connection_count,
      reputation: p.reputation,
      feedback_given: p.feedback_given_count,
    },
    pro: Boolean(p.pro_until && new Date(p.pro_until).getTime() > Date.now()),
  };
}

export function publicChallenge(c: Challenge, origin: string) {
  return {
    slug: c.slug,
    title: c.title,
    body: c.body,
    sponsor: c.sponsor_name,
    prize: c.prize,
    stack: c.stack,
    category: c.category,
    starts_at: c.starts_at,
    ends_at: c.ends_at,
    entries: c.entry_count,
    url: `${origin}/challenges/${c.slug}`,
  };
}

export function clampLimit(value: string | null, fallback = 20, max = 50): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : fallback;
}
