import "server-only";

import { cache } from "react";

import { CATEGORIES, PRICING, STAGES, TESTER_RANKS, isOneOf, testerRank } from "./constants";
import {
  demoApps,
  demoCommentDate,
  demoComments,
  demoDrops,
  demoFeaturedIds,
  demoProfiles,
  demoQuestions,
  demoSchedule,
  demoSwaps,
  demoTestRequests,
  demoUpdates,
} from "./demo";
import { isSupabaseConfigured, publicFileUrl } from "./supabase/env";
import { createClient } from "./supabase/server";
import type {
  App,
  AppCard,
  AppDetail,
  Comment,
  Conversation,
  ConnectionRequest,
  ConnectionState,
  CreditEvent,
  Drop,
  FeaturedApp,
  FeedItem,
  Feedback,
  FeedbackPanel,
  InboxCounts,
  Message,
  Notification,
  Profile,
  ProfileSummary,
  Question,
  Passport,
  QueueItem,
  Swap,
  TestRequest,
  TopTester,
  Update,
  Viewer,
} from "./types";

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
    feedback_count: row.feedback_count ?? 0,
    would_use_yes_count: row.would_use_yes_count ?? 0,
    rating_sum: row.rating_sum ?? 0,
    launch_at: row.launch_at ?? null,
    boosted_until: row.boosted_until ?? null,
    created_at: row.created_at,
  };
}

function toFeedback(row: any): Feedback {
  return {
    id: row.id,
    would_use: row.would_use,
    rating: row.rating,
    worked: row.worked,
    confusing: row.confusing ?? "",
    earned: row.earned ?? 0,
    helpful_at: row.helpful_at,
    created_at: row.created_at,
    user: toSummary(row.user),
    user_rank: testerRank(row.user?.feedback_given_count ?? 0, row.user?.feedback_helpful_count ?? 0),
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
  const { data: profile } = await supabase.from("profiles").select("username, credits").eq("id", id).maybeSingle();
  return profile ? { id, username: profile.username, credits: profile.credits ?? 0 } : null;
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
    const found = demoApps.find((a) => a.slug === slug);
    if (!found) return null;
    const app = { ...found, ...demoSchedule()[found.id] };
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

// ---------------------------------------------------------------------------
// Phase 3: credits and feedback
// ---------------------------------------------------------------------------

const FEEDBACK_FIELDS = `id, would_use, rating, worked, confusing, earned, helpful_at, created_at,
  user:profiles!feedback_user_id_fkey(${PROFILE_SUMMARY}, feedback_given_count, feedback_helpful_count)`;

const RANK_ORDER: string[] = TESTER_RANKS.map((r) => r.slug);

function openRequest(row: TestRequest | null | undefined): TestRequest | null {
  return row ? { slots_total: row.slots_total, slots_filled: row.slots_filled } : null;
}

export async function getFeedbackPanel(app: App, viewer: Viewer | null): Promise<FeedbackPanel> {
  if (!isSupabaseConfigured) return { mode: "demo", request: demoTestRequests[app.id] ?? null };

  const supabase = await createClient();
  const { data: req } = await supabase
    .from("test_requests")
    .select("slots_total, slots_filled")
    .eq("app_id", app.id)
    .maybeSingle();
  const request = openRequest(req);

  if (!viewer) return { mode: "signed-out", request };

  if (viewer.id === app.owner_id) {
    const { data } = await supabase
      .from("feedback")
      .select(FEEDBACK_FIELDS)
      .eq("app_id", app.id)
      .order("created_at", { ascending: false })
      .limit(200);
    // Trusted and Pro testers' feedback shows first; newest first within a rank.
    const feedback = (data ?? [])
      .map(toFeedback)
      .sort((a, b) => RANK_ORDER.indexOf(b.user_rank) - RANK_ORDER.indexOf(a.user_rank) || b.created_at.localeCompare(a.created_at));
    return { mode: "owner", request, feedback, credits: viewer.credits };
  }

  const [{ data: mine }, { data: tried }] = await Promise.all([
    supabase.from("feedback").select(FEEDBACK_FIELDS).eq("app_id", app.id).eq("user_id", viewer.id).maybeSingle(),
    supabase.from("try_clicks").select("id").eq("app_id", app.id).eq("user_id", viewer.id).limit(1).maybeSingle(),
  ]);
  return { mode: "tester", request, tried: Boolean(tried), mine: mine ? toFeedback(mine) : null };
}

// Apps with open tester spots, oldest request first so everyone gets a turn.
// Leaves out the viewer's own apps and ones they've already reviewed.
export async function getTestQueue(viewer: Viewer | null): Promise<QueueItem[]> {
  if (!isSupabaseConfigured) {
    return demoApps
      .filter((a) => demoTestRequests[a.id])
      .map((a) => {
        const r = demoTestRequests[a.id];
        return { ...a, owner: toSummary(demoProfile(a.owner_id)), poster_url: null, spots_left: r.slots_total - r.slots_filled };
      })
      .filter((a) => a.spots_left > 0);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("test_requests")
    .select(
      `slots_total, slots_filled, opened_at,
       app:apps!inner(*, owner:profiles!apps_owner_id_fkey(${PROFILE_SUMMARY}), drops(poster_path, created_at))`,
    )
    .not("app.link_checked_at", "is", null)
    .order("opened_at", { ascending: true })
    .limit(100);
  if (error) throw new Error(`Couldn't load the test queue: ${error.message}`);

  let reviewed = new Set<string>();
  if (viewer) {
    const { data: mine } = await supabase.from("feedback").select("app_id").eq("user_id", viewer.id);
    reviewed = new Set((mine ?? []).map((r) => r.app_id as string));
  }

  return (data ?? [])
    .filter((row) => row.slots_filled < row.slots_total)
    .map((row) => {
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped embed */
      const app = row.app as any;
      const latest = [...(app.drops ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
      return {
        ...toApp(app),
        owner: toSummary(app.owner),
        poster_url: publicFileUrl(latest?.poster_path ?? null),
        spots_left: row.slots_total - row.slots_filled,
      };
    })
    .filter((a) => a.owner_id !== viewer?.id && !reviewed.has(a.id));
}

export async function getCreditHistory(viewer: Viewer): Promise<CreditEvent[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("credit_events")
    .select("id, delta, reason, created_at, app:apps(slug, name)")
    .eq("user_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map((row) => ({
    id: row.id,
    delta: row.delta,
    reason: row.reason,
    created_at: row.created_at,
    app: (row.app as unknown as CreditEvent["app"]) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Home feed: Featured and upcoming launches
// ---------------------------------------------------------------------------

const HOT_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

const CARD_SELECT = `*, owner:profiles!apps_owner_id_fkey(${PROFILE_SUMMARY}), drops(poster_path, created_at)`;

/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped rows */
function toCard(row: any): AppCard {
  const latest = [...(row.drops ?? [])].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return { ...toApp(row), owner: toSummary(row.owner), poster_url: publicFileUrl(latest?.poster_path ?? null) };
}

function demoCards(): AppCard[] {
  const schedule = demoSchedule();
  return demoApps.map((a) => ({
    ...a,
    ...schedule[a.id],
    owner: toSummary(demoProfile(a.owner_id)),
    poster_url: null,
  }));
}

export function isLaunchLive(app: Pick<App, "launch_at">, now = Date.now()): boolean {
  if (!app.launch_at) return false;
  const start = new Date(app.launch_at).getTime();
  return start <= now && now < start + DAY_MS;
}

export type AppStatus = {
  launch: "none" | "upcoming" | "live" | "done";
  launchEnds: string | null;
  boostedUntil: string | null;
};

export function appStatus(app: Pick<App, "launch_at" | "boosted_until">, now = Date.now()): AppStatus {
  const start = app.launch_at ? new Date(app.launch_at).getTime() : null;
  const launch =
    start === null ? "none" : now < start ? "upcoming" : now < start + DAY_MS ? "live" : "done";
  return {
    launch,
    launchEnds: start === null ? null : new Date(start + DAY_MS).toISOString(),
    boostedUntil: app.boosted_until && new Date(app.boosted_until).getTime() > now ? app.boosted_until : null,
  };
}

// The Featured row, in this order: hand-picked apps, apps on their launch
// day, then boosted apps. With none of those, the hottest recent apps.
export async function getFeatured(): Promise<{ apps: FeaturedApp[]; curated: boolean }> {
  const now = Date.now();
  let picked: AppCard[];
  let launching: AppCard[];
  let boosted: AppCard[];

  if (!isSupabaseConfigured) {
    const cards = demoCards();
    picked = demoFeaturedIds.map((id) => cards.find((a) => a.id === id)!);
    launching = cards.filter((a) => isLaunchLive(a, now));
    boosted = cards.filter((a) => a.boosted_until && new Date(a.boosted_until).getTime() > now);
  } else {
    const supabase = await createClient();
    const nowIso = new Date(now).toISOString();
    const base = () => supabase.from("apps").select(CARD_SELECT).not("link_checked_at", "is", null);
    const [p, l, b] = await Promise.all([
      base().gt("featured_until", nowIso).order("featured_until", { ascending: false }).limit(8),
      base().lte("launch_at", nowIso).gt("launch_at", new Date(now - DAY_MS).toISOString()).order("launch_at").limit(8),
      base().gt("boosted_until", nowIso).order("boosted_until", { ascending: false }).limit(8),
    ]);
    picked = (p.data ?? []).map(toCard);
    launching = (l.data ?? []).map(toCard);
    boosted = (b.data ?? []).map(toCard);
  }

  const seen = new Set<string>();
  const apps: FeaturedApp[] = [];
  const add = (list: AppCard[], reason: FeaturedApp["reason"]) => {
    for (const a of list) {
      if (seen.has(a.id) || apps.length >= 12) continue;
      seen.add(a.id);
      apps.push({ ...a, reason });
    }
  };
  add(picked, "featured");
  add(launching, "launch");
  add(boosted, "boosted");
  if (apps.length > 0) return { apps, curated: true };

  const supabase = await createClient();
  const { data: hot } = await supabase
    .from("apps")
    .select(CARD_SELECT)
    .not("link_checked_at", "is", null)
    .gte("created_at", new Date(now - HOT_WINDOW_DAYS * DAY_MS).toISOString())
    .order("like_count", { ascending: false })
    .order("try_count", { ascending: false })
    .limit(6);
  return { apps: (hot ?? []).map((row) => ({ ...toCard(row), reason: "hot" as const })), curated: false };
}

// Launches in the next 7 days, soonest first.
export async function getUpcomingLaunches(): Promise<AppCard[]> {
  const now = Date.now();
  if (!isSupabaseConfigured) {
    return demoCards()
      .filter((a) => a.launch_at && new Date(a.launch_at).getTime() > now)
      .sort((a, b) => a.launch_at!.localeCompare(b.launch_at!));
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("apps")
    .select(CARD_SELECT)
    .not("link_checked_at", "is", null)
    .gt("launch_at", new Date(now).toISOString())
    .lt("launch_at", new Date(now + 7 * DAY_MS).toISOString())
    .order("launch_at")
    .limit(10);
  return (data ?? []).map(toCard);
}

// ---------------------------------------------------------------------------
// Tester Passport
// ---------------------------------------------------------------------------

export async function getPassport(profileId: string): Promise<Passport> {
  if (!isSupabaseConfigured) {
    const demo: Record<string, Passport> = {
      "demo-ada": { categories: { productivity: 6, design: 5, "dev-tools": 4, ai: 5, finance: 3 }, streak: 3 },
      "demo-marco": {
        categories: { education: 9, productivity: 6, games: 5, ai: 7, design: 4, social: 5, health: 3, finance: 2 },
        streak: 6,
      },
      "demo-june": { categories: { design: 5, ai: 3 }, streak: 1 },
    };
    return demo[profileId] ?? { categories: {}, streak: 0 };
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("tester_passport", { p_user: profileId });
  return { categories: data?.categories ?? {}, streak: data?.streak ?? 0 };
}

export async function getTopTesters(): Promise<TopTester[]> {
  if (!isSupabaseConfigured) {
    return demoProfiles
      .map((p) => ({
        user_id: p.id,
        username: p.username,
        display_name: p.display_name,
        feedback_count: Math.round(p.feedback_given_count / 3),
        helpful_count: Math.round(p.feedback_helpful_count / 3),
      }))
      .sort((a, b) => b.helpful_count - a.helpful_count || b.feedback_count - a.feedback_count);
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("top_testers", { p_limit: 10 });
  return (data ?? []).map((r: TopTester) => ({ ...r, feedback_count: Number(r.feedback_count), helpful_count: Number(r.helpful_count) }));
}

// ---------------------------------------------------------------------------
// Build-in-public updates
// ---------------------------------------------------------------------------

type UpdateScope = { appId?: string; userId?: string; following?: Viewer | null; limit?: number };

// Latest updates for an app, a builder, the people someone follows, or everyone.
export async function getUpdates({ appId, userId, following, limit = 20 }: UpdateScope): Promise<Update[]> {
  if (!isSupabaseConfigured) {
    return demoUpdates
      .filter((u) => (!appId || u.app === appId) && (!userId || u.user === userId))
      .slice(0, limit)
      .map((u, i) => {
        const app = u.app ? demoApps.find((a) => a.id === u.app) : null;
        return {
          id: `demo-update-${i}`,
          body: u.body,
          created_at: new Date(Date.UTC(2026, 8, 23) - u.hours * 3600_000).toISOString(),
          user: toSummary(demoProfile(u.user)),
          app: app ? { slug: app.slug, name: app.name } : null,
        };
      });
  }

  const supabase = await createClient();
  let query = supabase
    .from("updates")
    .select(`id, body, created_at, user:profiles!updates_user_id_fkey(${PROFILE_SUMMARY}), app:apps(slug, name)`)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (appId) query = query.eq("app_id", appId);
  if (userId) query = query.eq("user_id", userId);
  if (following) {
    const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", following.id);
    const ids = [following.id, ...(follows ?? []).map((f) => f.following_id as string)];
    query = query.in("user_id", ids);
  }
  const { data } = await query;
  return (data ?? []).map((row) => ({
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    user: toSummary(row.user),
    app: (row.app as unknown as Update["app"]) ?? null,
  }));
}

// The signed-in builder's live apps, for "which app is this about?" pickers.
export async function getMyApps(viewer: Viewer | null): Promise<{ id: string; slug: string; name: string }[]> {
  if (!viewer) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("apps")
    .select("id, slug, name")
    .eq("owner_id", viewer.id)
    .not("link_checked_at", "is", null)
    .order("created_at", { ascending: false });
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Swaps and co-launches
// ---------------------------------------------------------------------------

const SWAP_SELECT = `id, kind, status, launch_at, created_at,
  from:apps!swaps_from_app_fkey(id, slug, name, owner_id),
  to:apps!swaps_to_app_fkey(id, slug, name, owner_id)`;

/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped rows */
const toSwap = (row: any): Swap => ({ ...row, from: row.from, to: row.to });

// Accepted partners of an app: "Friends of" (shoutout swaps) and co-launches.
export async function getSwapPartners(appId: string): Promise<{ friends: AppCard[]; colaunch: AppCard[] }> {
  if (!isSupabaseConfigured) {
    const cards = demoCards();
    const friends = demoSwaps
      .filter(([a, b]) => a === appId || b === appId)
      .map(([a, b]) => cards.find((c) => c.id === (a === appId ? b : a))!)
      .filter(Boolean);
    return { friends, colaunch: [] };
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("swaps")
    .select("kind, from_app, to_app")
    .eq("status", "accepted")
    .or(`from_app.eq.${appId},to_app.eq.${appId}`);
  const rows = data ?? [];
  const otherIds = [...new Set(rows.map((r) => (r.from_app === appId ? r.to_app : r.from_app) as string))];
  if (otherIds.length === 0) return { friends: [], colaunch: [] };
  const { data: apps } = await supabase.from("apps").select(CARD_SELECT).in("id", otherIds);
  const byId = new Map((apps ?? []).map((a) => [a.id as string, toCard(a)]));
  const pick = (kind: string) =>
    rows
      .filter((r) => r.kind === kind)
      .map((r) => byId.get((r.from_app === appId ? r.to_app : r.from_app) as string))
      .filter((a): a is AppCard => Boolean(a));
  return { friends: pick("swap"), colaunch: pick("colaunch") };
}

// Every swap and co-launch request involving the viewer's apps.
export async function getMySwaps(viewer: Viewer): Promise<Swap[]> {
  const supabase = await createClient();
  const mine = await getMyApps(viewer);
  if (mine.length === 0) return [];
  const ids = mine.map((a) => a.id).join(",");
  const { data } = await supabase
    .from("swaps")
    .select(SWAP_SELECT)
    .or(`from_app.in.(${ids}),to_app.in.(${ids})`)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []).map(toSwap);
}

// ---------------------------------------------------------------------------
// Phase 2: inbox, notifications, connections, messages
// ---------------------------------------------------------------------------

// Unread notifications, unread messages and connection requests waiting on you.
export const getInboxCounts = cache(async (viewer: Viewer | null): Promise<InboxCounts> => {
  if (!viewer) return { notifications: 0, messages: 0, requests: 0 };
  const supabase = await createClient();
  const [n, m, r] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", viewer.id).is("read_at", null),
    supabase.from("messages").select("id", { count: "exact", head: true }).eq("recipient_id", viewer.id).is("read_at", null),
    supabase
      .from("connections")
      .select("id", { count: "exact", head: true })
      .eq("addressee_id", viewer.id)
      .eq("status", "pending"),
  ]);
  return { notifications: n.count ?? 0, messages: m.count ?? 0, requests: r.count ?? 0 };
});

export async function getNotifications(viewer: Viewer): Promise<Notification[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select(`id, kind, created_at, read_at, ref_id, actor:profiles!notifications_actor_id_fkey(${PROFILE_SUMMARY}), app:apps(slug, name)`)
    .eq("user_id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []).map((row) => ({
    id: row.id,
    kind: row.kind,
    created_at: row.created_at,
    read_at: row.read_at,
    ref_id: row.ref_id,
    actor: row.actor ? toSummary(row.actor) : null,
    app: (row.app as unknown as Notification["app"]) ?? null,
  }));
}

const CONNECTION_PEOPLE = `id, reason, note, status, created_at, requester_id, addressee_id,
  requester:profiles!connections_requester_id_fkey(${PROFILE_SUMMARY}),
  addressee:profiles!connections_addressee_id_fkey(${PROFILE_SUMMARY})`;

export async function getConnectionRequests(viewer: Viewer): Promise<{ received: ConnectionRequest[]; sent: ConnectionRequest[] }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select(CONNECTION_PEOPLE)
    .eq("status", "pending")
    .or(`requester_id.eq.${viewer.id},addressee_id.eq.${viewer.id}`)
    .order("created_at", { ascending: false });
  const rows = data ?? [];
  const shape = (row: (typeof rows)[number], who: "requester" | "addressee"): ConnectionRequest => ({
    id: row.id,
    reason: row.reason,
    note: row.note,
    created_at: row.created_at,
    person: toSummary(row[who]),
  });
  return {
    received: rows.filter((r) => r.addressee_id === viewer.id).map((r) => shape(r, "requester")),
    sent: rows.filter((r) => r.requester_id === viewer.id).map((r) => shape(r, "addressee")),
  };
}

export async function getConnectionState(viewer: Viewer | null, profileId: string): Promise<ConnectionState> {
  if (!viewer || viewer.id === profileId || !isSupabaseConfigured) return { status: "none" };
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select("id, status, requester_id, reason, note")
    .or(
      `and(requester_id.eq.${viewer.id},addressee_id.eq.${profileId}),and(requester_id.eq.${profileId},addressee_id.eq.${viewer.id})`,
    )
    .maybeSingle();
  if (!data) return { status: "none" };
  if (data.status === "accepted") return { status: "connected", id: data.id };
  if (data.status === "declined") return { status: data.requester_id === viewer.id ? "declined" : "none" };
  return data.requester_id === viewer.id
    ? { status: "sent", id: data.id }
    : { status: "received", id: data.id, reason: data.reason, note: data.note };
}

/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped rows */
const toMessage = (row: any, viewerId: string): Message => ({
  id: row.id,
  body: row.body,
  created_at: row.created_at,
  read_at: row.read_at,
  mine: row.sender_id === viewerId,
});

// The latest message with each person, newest first.
export async function getConversations(viewer: Viewer): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, body, created_at, read_at, sender_id, recipient_id")
    .or(`sender_id.eq.${viewer.id},recipient_id.eq.${viewer.id}`)
    .order("created_at", { ascending: false })
    .limit(500);
  const threads = new Map<string, { last: Message; unread: number }>();
  for (const row of data ?? []) {
    const other = row.sender_id === viewer.id ? row.recipient_id : row.sender_id;
    const t = threads.get(other) ?? { last: toMessage(row, viewer.id), unread: 0 };
    if (row.recipient_id === viewer.id && !row.read_at) t.unread++;
    threads.set(other, t);
  }
  if (threads.size === 0) return [];
  const { data: people } = await supabase.from("profiles").select(PROFILE_SUMMARY).in("id", [...threads.keys()]);
  const byId = new Map((people ?? []).map((p) => [p.id as string, toSummary(p)]));
  return [...threads.entries()]
    .filter(([id]) => byId.has(id))
    .map(([id, t]) => ({ person: byId.get(id)!, ...t }));
}

export async function getThread(
  viewer: Viewer,
  username: string,
): Promise<{ person: ProfileSummary; messages: Message[]; connection: ConnectionState } | null> {
  const supabase = await createClient();
  const { data: person } = await supabase.from("profiles").select(PROFILE_SUMMARY).eq("username", username).maybeSingle();
  if (!person || person.id === viewer.id) return null;
  const [{ data }, connection] = await Promise.all([
    supabase
      .from("messages")
      .select("id, body, created_at, read_at, sender_id, recipient_id")
      .or(
        `and(sender_id.eq.${viewer.id},recipient_id.eq.${person.id}),and(sender_id.eq.${person.id},recipient_id.eq.${viewer.id})`,
      )
      .order("created_at", { ascending: true })
      .limit(300),
    getConnectionState(viewer, person.id),
  ]);
  return { person: toSummary(person), messages: (data ?? []).map((r) => toMessage(r, viewer.id)), connection };
}

// ---------------------------------------------------------------------------
// Q&A
// ---------------------------------------------------------------------------

// Questions on an app, most upvoted first; answers with the best one first.
export async function getQuestions(appId: string, viewer: Viewer | null): Promise<Question[]> {
  if (!isSupabaseConfigured) {
    return (demoQuestions[appId] ?? []).map((q, qi) => {
      const answers = q.answers.map((a, ai) => ({
        id: `demo-a-${qi}-${ai}`,
        body: a.body,
        created_at: demoCommentDate(1 - ai * 0.2),
        vote_count: a.votes,
        voted: false,
        user: toSummary(demoProfile(a.user)),
      }));
      const best = q.answers.findIndex((a) => a.best);
      return {
        id: `demo-q-${qi}`,
        body: q.body,
        created_at: demoCommentDate(2 - qi),
        vote_count: q.votes,
        voted: false,
        best_answer_id: best >= 0 ? answers[best].id : null,
        user: toSummary(demoProfile(q.user)),
        answers,
      };
    });
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("questions")
    .select(
      `id, body, created_at, vote_count, best_answer_id, user:profiles!questions_user_id_fkey(${PROFILE_SUMMARY}),
       answers(id, body, created_at, vote_count, user:profiles!answers_user_id_fkey(${PROFILE_SUMMARY}))`,
    )
    .eq("app_id", appId)
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = data ?? [];

  let votedQ = new Set<string>();
  let votedA = new Set<string>();
  if (viewer && rows.length > 0) {
    const qIds = rows.map((r) => r.id as string);
    const aIds = rows.flatMap((r) => (r.answers ?? []).map((a: { id: string }) => a.id));
    const [qv, av] = await Promise.all([
      supabase.from("question_votes").select("question_id").eq("user_id", viewer.id).in("question_id", qIds),
      aIds.length
        ? supabase.from("answer_votes").select("answer_id").eq("user_id", viewer.id).in("answer_id", aIds)
        : Promise.resolve({ data: [] as { answer_id: string }[] }),
    ]);
    votedQ = new Set((qv.data ?? []).map((v) => v.question_id as string));
    votedA = new Set((av.data ?? []).map((v) => v.answer_id as string));
  }

  return rows.map((q) => ({
    id: q.id,
    body: q.body,
    created_at: q.created_at,
    vote_count: q.vote_count,
    voted: votedQ.has(q.id),
    best_answer_id: q.best_answer_id,
    user: toSummary(q.user),
    answers: ((q.answers ?? []) as unknown as { id: string; body: string; created_at: string; vote_count: number; user: unknown }[])
      .map((a) => ({ ...a, voted: votedA.has(a.id), user: toSummary(a.user) }))
      .sort(
        (a, b) =>
          Number(b.id === q.best_answer_id) - Number(a.id === q.best_answer_id) ||
          b.vote_count - a.vote_count ||
          a.created_at.localeCompare(b.created_at),
      ),
  }));
}
