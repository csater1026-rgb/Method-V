import "server-only";

import { cache } from "react";

import { CATEGORIES, PRICING, STAGES, isOneOf } from "./constants";
import { demoApps, demoCommentDate, demoComments, demoDrops, demoProfiles } from "./demo";
import { isSupabaseConfigured, publicFileUrl } from "./supabase/env";
import { createClient } from "./supabase/server";
import type { App, AppCard, AppDetail, Comment, Drop, FeedItem, Profile, ProfileSummary, Viewer } from "./types";

// All reads go through here. Each function returns sample data in demo mode.

export type FeedTab = "new" | "trending" | "following";

const PROFILE_SUMMARY = "id, username, display_name, roles";
const TRENDING_WINDOW_DAYS = 14;
const PAGE_SIZE = 30;

/* eslint-disable @typescript-eslint/no-explicit-any -- rows come back untyped without generated types */

function toSummary(row: any): ProfileSummary {
  return { id: row.id, username: row.username, display_name: row.display_name ?? "", roles: row.roles ?? [] };
}

function toDrop(row: any): Drop {
  return {
    id: row.id,
    app_id: row.app_id,
    owner_id: row.owner_id,
    video_url: publicFileUrl(row.video_path),
    poster_url: publicFileUrl(row.poster_path),
    duration_seconds: Number(row.duration_seconds),
    caption: row.caption ?? "",
    like_count: row.like_count ?? 0,
    comment_count: row.comment_count ?? 0,
    created_at: row.created_at,
  };
}

function toApp(row: any): App {
  return {
    id: row.id,
    owner_id: row.owner_id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description ?? "",
    url: row.url,
    category: row.category,
    tech_stack: row.tech_stack ?? [],
    pricing: row.pricing,
    stage: row.stage,
    try_count: row.try_count ?? 0,
    like_count: row.like_count ?? 0,
    created_at: row.created_at,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

const demoProfile = (id: string) => demoProfiles.find((p) => p.id === id)!;

export const getViewer = cache(async (): Promise<Viewer | null> => {
  if (!isSupabaseConfigured) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const id = data?.claims?.sub;
  if (!id) return null;
  const { data: profile } = await supabase.from("profiles").select("username").eq("id", id).maybeSingle();
  return profile ? { id, username: profile.username } : null;
});

async function likedDropIds(viewer: Viewer | null, dropIds: string[]): Promise<Set<string>> {
  if (!viewer || dropIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data } = await supabase.from("likes").select("drop_id").eq("user_id", viewer.id).in("drop_id", dropIds);
  return new Set((data ?? []).map((r) => r.drop_id as string));
}

export async function getFeed({ tab, category }: { tab: FeedTab; category?: string }): Promise<FeedItem[]> {
  const cat = isOneOf(CATEGORIES, category) ? category : undefined;

  if (!isSupabaseConfigured) {
    if (tab === "following") return [];
    let drops = demoDrops.filter((d) => !cat || demoApps.find((a) => a.id === d.app_id)?.category === cat);
    if (tab === "trending") drops = [...drops].sort((a, b) => b.like_count - a.like_count);
    return drops.map((d) => {
      const app = demoApps.find((a) => a.id === d.app_id)!;
      return { ...d, app, owner: toSummary(demoProfile(d.owner_id)), liked: false };
    });
  }

  const viewer = await getViewer();
  const supabase = await createClient();
  let query = supabase
    .from("drops")
    .select(
      `id, app_id, owner_id, video_path, poster_path, duration_seconds, caption, like_count, comment_count, created_at,
       app:apps!inner(id, slug, name, tagline, category, try_count, link_checked_at),
       owner:profiles!drops_owner_id_fkey(${PROFILE_SUMMARY})`,
    )
    .not("app.link_checked_at", "is", null)
    .limit(PAGE_SIZE);

  if (cat) query = query.eq("app.category", cat);

  if (tab === "following") {
    if (!viewer) return [];
    const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", viewer.id);
    const ids = (follows ?? []).map((f) => f.following_id as string);
    if (ids.length === 0) return [];
    query = query.in("owner_id", ids).order("created_at", { ascending: false });
  } else if (tab === "trending") {
    const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    query = query
      .gte("created_at", since)
      .order("like_count", { ascending: false })
      .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  const { data, error } = await query;
  if (error) throw new Error(`Couldn't load Drops: ${error.message}`);
  const rows = data ?? [];
  const liked = await likedDropIds(viewer, rows.map((r) => r.id as string));

  return rows.map((row) => {
    // Embedded one-to-one relations come back as objects at runtime.
    const app = row.app as unknown as FeedItem["app"];
    return {
      ...toDrop(row),
      app: { id: app.id, slug: app.slug, name: app.name, tagline: app.tagline, category: app.category, try_count: app.try_count },
      owner: toSummary(row.owner),
      liked: liked.has(row.id as string),
    };
  });
}

export type BrowseFilters = {
  q?: string;
  category?: string;
  stack?: string;
  pricing?: string;
  stage?: string;
  sort?: string;
};

export async function getApps(filters: BrowseFilters): Promise<AppCard[]> {
  const category = isOneOf(CATEGORIES, filters.category) ? filters.category : undefined;
  const pricing = isOneOf(PRICING, filters.pricing) ? filters.pricing : undefined;
  const stage = isOneOf(STAGES, filters.stage) ? filters.stage : undefined;
  const stack = filters.stack?.trim().slice(0, 40) || undefined;
  const q = filters.q?.trim().slice(0, 100) || undefined;
  const sortByTries = filters.sort === "tried";

  if (!isSupabaseConfigured) {
    const needle = q?.toLowerCase();
    return demoApps
      .filter((a) => !category || a.category === category)
      .filter((a) => !pricing || a.pricing === pricing)
      .filter((a) => !stage || a.stage === stage)
      .filter((a) => !stack || a.tech_stack.some((s) => s.toLowerCase() === stack.toLowerCase()))
      .filter((a) => !needle || `${a.name} ${a.tagline} ${a.description}`.toLowerCase().includes(needle))
      .sort((a, b) => (sortByTries ? b.try_count - a.try_count : b.created_at.localeCompare(a.created_at)))
      .map((a) => ({ ...a, owner: toSummary(demoProfile(a.owner_id)), poster_url: null }));
  }

  const supabase = await createClient();
  let query = supabase
    .from("apps")
    .select(`*, owner:profiles!apps_owner_id_fkey(${PROFILE_SUMMARY}), drops(poster_path, created_at)`)
    .not("link_checked_at", "is", null)
    .order("created_at", { referencedTable: "drops", ascending: false })
    .limit(1, { referencedTable: "drops" })
    .limit(60);

  if (category) query = query.eq("category", category);
  if (pricing) query = query.eq("pricing", pricing);
  if (stage) query = query.eq("stage", stage);
  if (stack) query = query.contains("tech_stack", [stack]);
  if (q) query = query.textSearch("search", q, { type: "websearch", config: "english" });
  query = sortByTries
    ? query.order("try_count", { ascending: false }).order("created_at", { ascending: false })
    : query.order("created_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`Couldn't load apps: ${error.message}`);
  return (data ?? []).map((row) => ({
    ...toApp(row),
    owner: toSummary(row.owner),
    poster_url: publicFileUrl(row.drops?.[0]?.poster_path ?? null),
  }));
}

export async function getApp(slug: string): Promise<AppDetail | null> {
  if (!isSupabaseConfigured) {
    const app = demoApps.find((a) => a.slug === slug);
    if (!app) return null;
    return {
      ...app,
      owner: toSummary(demoProfile(app.owner_id)),
      drop: demoDrops.find((d) => d.app_id === app.id) ?? null,
      liked: false,
    };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("apps")
    .select(`*, owner:profiles!apps_owner_id_fkey(${PROFILE_SUMMARY})`)
    .eq("slug", slug)
    .maybeSingle();
  if (!row) return null;

  const { data: dropRow } = await supabase
    .from("drops")
    .select("*")
    .eq("app_id", row.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const drop = dropRow ? toDrop(dropRow) : null;
  const liked = drop ? (await likedDropIds(await getViewer(), [drop.id])).has(drop.id) : false;

  return { ...toApp(row), owner: toSummary(row.owner), drop, liked };
}

export async function getComments(dropId: string): Promise<Comment[]> {
  if (!isSupabaseConfigured) {
    return (demoComments[dropId] ?? []).map((c, i) => ({
      id: `${dropId}-${i}`,
      body: c.body,
      created_at: demoCommentDate(c.days),
      user: toSummary(demoProfile(c.user)),
    }));
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("comments")
    .select(`id, body, created_at, user:profiles!comments_user_id_fkey(${PROFILE_SUMMARY})`)
    .eq("drop_id", dropId)
    .order("created_at", { ascending: true })
    .limit(200);
  return (data ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    user: toSummary(row.user),
  }));
}

export async function isFollowing(viewer: Viewer | null, profileId: string): Promise<boolean> {
  if (!viewer || viewer.id === profileId || !isSupabaseConfigured) return false;
  const supabase = await createClient();
  const { data } = await supabase
    .from("follows")
    .select("follower_id")
    .eq("follower_id", viewer.id)
    .eq("following_id", profileId)
    .maybeSingle();
  return Boolean(data);
}

export async function getProfile(
  username: string,
): Promise<{ profile: Profile; apps: AppCard[]; isFollowing: boolean } | null> {
  if (!isSupabaseConfigured) {
    const profile = demoProfiles.find((p) => p.username === username);
    if (!profile) return null;
    const apps = demoApps
      .filter((a) => a.owner_id === profile.id)
      .map((a) => ({ ...a, owner: toSummary(profile), poster_url: null }));
    return { profile, apps, isFollowing: false };
  }

  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  if (!profile) return null;

  const [{ data: appRows }, viewer] = await Promise.all([
    supabase
      .from("apps")
      .select("*, drops(poster_path, created_at)")
      .eq("owner_id", profile.id)
      .not("link_checked_at", "is", null)
      .order("created_at", { ascending: false })
      .order("created_at", { referencedTable: "drops", ascending: false })
      .limit(1, { referencedTable: "drops" }),
    getViewer(),
  ]);

  const following = await isFollowing(viewer, profile.id);

  const owner = toSummary(profile);
  const apps = (appRows ?? []).map((row) => ({
    ...toApp(row),
    owner,
    poster_url: publicFileUrl(row.drops?.[0]?.poster_path ?? null),
  }));
  return { profile: profile as Profile, apps, isFollowing: following };
}

export async function getOwnProfile(): Promise<Profile | null> {
  const viewer = await getViewer();
  if (!viewer) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").eq("id", viewer.id).maybeSingle();
  return (data as Profile | null) ?? null;
}
