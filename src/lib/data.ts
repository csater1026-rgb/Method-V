import "server-only";

import { cache } from "react";

import { CATEGORIES, PRICING, STAGES, TESTER_RANKS, isOneOf, testerRank } from "./constants";
import {
  demoApps,
  demoBackers,
  demoBrands,
  demoChallenges,
  demoDay,
  demoSponsors,
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
import { SIGNALS, bumpInterest, mergeInterests, rankFeed, rankQuestions, type Interests } from "./interests";
import { SUGGESTION_LIMIT, topUpSuggestions } from "./suggest";
import { isSupabaseConfigured, publicFileUrl } from "./supabase/env";
import { createClient } from "./supabase/server";
import type {
  Analytics,
  App,
  AppCard,
  Brand,
  Backer,
  Challenge,
  ChallengeEntry,
  Earnings,
  SponsorCard,
  Sponsorship,
  PackageDeal,
  SponsorPackage,
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
  Answer,
  Question,
  QuestionCard,
  Suggestion,
  Passport,
  QueueItem,
  Swap,
  TestRequest,
  TopBuilder,
  TopTester,
  Update,
  Viewer,
} from "./types";

// All reads go through here. Each function returns sample data in demo mode.

export type FeedTab = "foryou" | "trending" | "following";

const PROFILE_SUMMARY = "id, username, display_name, roles" as const;

// Profile photos need the avatar_path column (migration 20261001000000_avatars).
// Until it's there, everything keeps working with letter avatars; checked again
// every minute until it shows up.
let avatarColumn = false;
let avatarCheckedAt = 0;
async function checkAvatarColumn() {
  if (avatarColumn || !isSupabaseConfigured || Date.now() - avatarCheckedAt < 60_000) return;
  avatarCheckedAt = Date.now();
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").select("avatar_path").limit(1);
  avatarColumn = !error;
}
export async function avatarsReady(): Promise<boolean> {
  await checkAvatarColumn();
  return avatarColumn;
}
// Typed as the base list so Supabase's select parser keeps working; the rows
// are untyped anyway, and toSummary reads avatar_path when it's there.
// Photo URLs for people whose rows came from a function without them.
async function photoUrls(ids: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (ids.length === 0 || !(await avatarsReady())) return out;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, avatar_path").in("id", ids);
  for (const p of data ?? []) out.set(p.id as string, publicFileUrl((p.avatar_path as string | null) ?? null));
  return out;
}

const summaryCols = () => (avatarColumn ? `${PROFILE_SUMMARY}, avatar_path` : PROFILE_SUMMARY) as typeof PROFILE_SUMMARY;
const TRENDING_WINDOW_DAYS = 14;
const PAGE_SIZE = 30;
// How many recent Drops "For you" ranks to pick its page from.
const FOR_YOU_POOL = 200;

/* eslint-disable @typescript-eslint/no-explicit-any -- rows come back untyped without generated types */

function toSummary(row: any): ProfileSummary {
  return {
    id: row.id,
    username: row.username,
    display_name: row.display_name ?? "",
    roles: row.roles ?? [],
    avatar_url: publicFileUrl(row.avatar_path ?? null),
  };
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
    boosted_from: row.boosted_from ?? null,
    backer_count: row.backer_count ?? 0,
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
  await checkAvatarColumn();
  const { data: profile } = await supabase
    .from("profiles")
    .select(avatarColumn ? "username, credits, avatar_path" : "username, credits")
    .eq("id", id)
    .maybeSingle<{ username: string; credits: number | null; avatar_path?: string | null }>();
  return profile
    ? { id, username: profile.username, credits: profile.credits ?? 0, avatar_url: publicFileUrl(profile.avatar_path ?? null) }
    : null;
});

async function likedDropIds(viewer: Viewer | null, dropIds: string[]): Promise<Set<string>> {
  if (!viewer || dropIds.length === 0) return new Set();
  const supabase = await createClient();
  const { data } = await supabase.from("likes").select("drop_id").eq("user_id", viewer.id).in("drop_id", dropIds);
  return new Set((data ?? []).map((r) => r.drop_id as string));
}

// "interests" is what this visitor's browser has learned (see lib/interests);
// signed-in people's likes, comments, feedback and follows are added to it.
export async function getFeed({ tab, interests = {} }: { tab: FeedTab; interests?: Interests }): Promise<FeedItem[]> {
  if (!isSupabaseConfigured) {
    if (tab === "following") return [];
    const items = demoDrops.map((d) => {
      const app = demoApps.find((a) => a.id === d.app_id)!;
      return { ...d, app, owner: toSummary(demoProfile(d.owner_id)), liked: false, sponsor: demoSponsorCard(app.id) };
    });
    if (tab === "trending") return items.sort((a, b) => b.like_count - a.like_count);
    return rankFeed(items, { interests });
  }

  const viewer = await getViewer();
  const supabase = await createClient();
  let query = supabase
    .from("drops")
    .select(
      `id, app_id, owner_id, video_path, poster_path, duration_seconds, caption, like_count, comment_count, created_at,
       app:apps!inner(id, slug, name, tagline, category, try_count, link_checked_at),
       owner:profiles!drops_owner_id_fkey(${summaryCols()})`,
    )
    .not("app.link_checked_at", "is", null);

  let following = new Set<string>();
  let learned: Interests = {};
  if (tab === "following") {
    if (!viewer) return [];
    const { data: follows } = await supabase.from("follows").select("following_id").eq("follower_id", viewer.id);
    const ids = (follows ?? []).map((f) => f.following_id as string);
    if (ids.length === 0) return [];
    query = query.in("owner_id", ids).order("created_at", { ascending: false }).limit(PAGE_SIZE);
  } else if (tab === "trending") {
    const since = new Date(Date.now() - TRENDING_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    query = query
      .gte("created_at", since)
      .order("like_count", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
  } else {
    query = query.order("created_at", { ascending: false }).limit(FOR_YOU_POOL);
    if (viewer) [following, learned] = await Promise.all([followingIds(viewer.id), viewerInterests(viewer.id)]);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Couldn't load Drops: ${error.message}`);
  const rows = data ?? [];
  const liked = await likedDropIds(viewer, rows.map((r) => r.id as string));

  const all = rows.map((row) => {
    // Embedded one-to-one relations come back as objects at runtime.
    const app = row.app as unknown as FeedItem["app"];
    return {
      ...toDrop(row),
      app: { id: app.id, slug: app.slug, name: app.name, tagline: app.tagline, category: app.category, try_count: app.try_count },
      owner: toSummary(row.owner),
      liked: liked.has(row.id as string),
    };
  });
  const page =
    tab === "foryou"
      ? rankFeed(all, { interests: mergeInterests(interests, learned), following, viewerId: viewer?.id }).slice(0, PAGE_SIZE)
      : all;
  const sponsors = await getSponsorCards(page.map((d) => d.app_id));
  return page.map((d) => ({ ...d, sponsor: sponsors.get(d.app_id) ?? null }));
}

async function followingIds(viewerId: string): Promise<Set<string>> {
  const supabase = await createClient();
  const { data } = await supabase.from("follows").select("following_id").eq("follower_id", viewerId);
  return new Set((data ?? []).map((f) => f.following_id as string));
}

// What a signed-in person's likes, comments and feedback say they're into.
async function viewerInterests(viewerId: string): Promise<Interests> {
  const supabase = await createClient();
  const [likes, comments, feedback] = await Promise.all([
    supabase.from("likes").select("drop:drops(app:apps(category))").eq("user_id", viewerId).order("created_at", { ascending: false }).limit(100),
    supabase.from("comments").select("drop:drops(app:apps(category))").eq("user_id", viewerId).order("created_at", { ascending: false }).limit(50),
    supabase.from("feedback").select("app:apps(category)").eq("user_id", viewerId).order("created_at", { ascending: false }).limit(50),
  ]);
  let out: Interests = {};
  const add = (category: unknown, amount: number) => {
    if (typeof category === "string") out = bumpInterest(out, category, amount);
  };
  // Embedded rows come back as objects at runtime.
  type Cat = { category?: string } | null;
  type ViaDrop = { drop: { app: Cat } | null };
  for (const row of (likes.data ?? []) as unknown as ViaDrop[]) add(row.drop?.app?.category, SIGNALS.liked);
  for (const row of (comments.data ?? []) as unknown as ViaDrop[]) add(row.drop?.app?.category, SIGNALS.comments);
  for (const row of (feedback.data ?? []) as unknown as { app: Cat }[]) add(row.app?.category, SIGNALS.feedback);
  return out;
}

export type BrowseFilters = {
  q?: string;
  category?: string;
  stack?: string;
  pricing?: string;
  stage?: string;
  sort?: string;
};

export async function getApps(filters: BrowseFilters, max = 60): Promise<AppCard[]> {
  const category = isOneOf(CATEGORIES, filters.category) ? filters.category : undefined;
  const pricing = isOneOf(PRICING, filters.pricing) ? filters.pricing : undefined;
  const stage = isOneOf(STAGES, filters.stage) ? filters.stage : undefined;
  const stack = filters.stack?.trim().slice(0, 40) || undefined;
  const q = filters.q?.trim().slice(0, 100) || undefined;
  const sortByTries = filters.sort === "tried";
  const limit = Math.min(Math.max(max, 1), 60);

  if (!isSupabaseConfigured) {
    const needle = q?.toLowerCase();
    return demoApps
      .filter((a) => !category || a.category === category)
      .filter((a) => !pricing || a.pricing === pricing)
      .filter((a) => !stage || a.stage === stage)
      .filter((a) => !stack || a.tech_stack.some((s) => s.toLowerCase() === stack.toLowerCase()))
      .filter((a) => !needle || `${a.name} ${a.tagline} ${a.description}`.toLowerCase().includes(needle))
      .sort((a, b) => (sortByTries ? b.try_count - a.try_count : b.created_at.localeCompare(a.created_at)))
      .slice(0, limit)
      .map((a) => ({ ...a, owner: toSummary(demoProfile(a.owner_id)), poster_url: null }));
  }

  const supabase = await createClient();
  let query = supabase
    .from("apps")
    .select(`*, owner:profiles!apps_owner_id_fkey(${summaryCols()}), drops(poster_path, created_at)`)
    .not("link_checked_at", "is", null)
    .order("created_at", { referencedTable: "drops", ascending: false })
    .limit(1, { referencedTable: "drops" })
    .limit(limit);

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
      sponsor: demoSponsorCard(app.id),
    };
  }

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("apps")
    .select(`*, owner:profiles!apps_owner_id_fkey(${summaryCols()})`)
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
  const [liked, sponsors] = await Promise.all([
    drop ? likedDropIds(await getViewer(), [drop.id]).then((s) => s.has(drop.id)) : false,
    getSponsorCards([row.id]),
  ]);

  return { ...toApp(row), owner: toSummary(row.owner), drop, liked, sponsor: sponsors.get(row.id) ?? null };
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
    .select(`id, body, created_at, user:profiles!comments_user_id_fkey(${summaryCols()})`)
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

export type NotificationSettings = { follows: boolean; feedback: boolean; messages: boolean; ready: boolean };

// Which pushes someone wants (all on until they turn one off). "ready" is
// false until migration 20261005000000_push is run.
export async function getNotificationSettings(viewer: Viewer | null): Promise<NotificationSettings> {
  const all = { follows: true, feedback: true, messages: true };
  if (!viewer) return { ...all, ready: false };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("notification_settings")
    .select("follows, feedback, messages")
    .eq("user_id", viewer.id)
    .maybeSingle();
  if (error) return { ...all, ready: false };
  return { ...all, ...(data ?? {}), ready: true };
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

const FEEDBACK_FIELDS = () => `id, would_use, rating, worked, confusing, earned, helpful_at, created_at,
  user:profiles!feedback_user_id_fkey(${summaryCols()}, feedback_given_count, feedback_helpful_count)` as const;

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
      .select(FEEDBACK_FIELDS())
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
    supabase.from("feedback").select(FEEDBACK_FIELDS()).eq("app_id", app.id).eq("user_id", viewer.id).maybeSingle(),
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
       app:apps!inner(*, owner:profiles!apps_owner_id_fkey(${summaryCols()}), drops(poster_path, created_at))`,
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

const CARD_SELECT = () => `*, owner:profiles!apps_owner_id_fkey(${summaryCols()}), drops(poster_path, created_at)` as const;

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
  // In the Spotlight until then (null when not)...
  boostedUntil: string | null;
  // ...or booked and waiting in line until then.
  spotlightStarts: string | null;
};

// Is the app in the Spotlight right now? (Booked ones can be waiting in line.)
export function inSpotlight(app: Pick<App, "boosted_until" | "boosted_from">, now = Date.now()): boolean {
  return Boolean(
    app.boosted_until &&
      new Date(app.boosted_until).getTime() > now &&
      (!app.boosted_from || new Date(app.boosted_from).getTime() <= now),
  );
}

export function appStatus(app: Pick<App, "launch_at" | "boosted_until" | "boosted_from">, now = Date.now()): AppStatus {
  const start = app.launch_at ? new Date(app.launch_at).getTime() : null;
  const launch =
    start === null ? "none" : now < start ? "upcoming" : now < start + DAY_MS ? "live" : "done";
  return {
    launch,
    launchEnds: start === null ? null : new Date(start + DAY_MS).toISOString(),
    boostedUntil: inSpotlight(app, now) ? app.boosted_until : null,
    spotlightStarts: app.boosted_from && new Date(app.boosted_from).getTime() > now ? app.boosted_from : null,
  };
}

// When a Spotlight booked now would start: now, or when a spot frees up.
// Null until migration 20261007000000_spotlight.sql is run.
export async function getSpotlightNextStart(): Promise<string | null> {
  if (!isSupabaseConfigured) return new Date().toISOString();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("spotlight_next_start");
  return error || !data ? null : (data as string);
}

// The Featured row, in this order: hand-picked apps, apps on their launch
// day, then apps in the Spotlight. With none of those, the hottest recent apps.
export async function getFeatured(): Promise<{ apps: FeaturedApp[]; curated: boolean }> {
  const now = Date.now();
  let picked: AppCard[];
  let launching: AppCard[];
  let boosted: AppCard[];

  if (!isSupabaseConfigured) {
    const cards = demoCards();
    picked = demoFeaturedIds.map((id) => cards.find((a) => a.id === id)!);
    launching = cards.filter((a) => isLaunchLive(a, now));
    boosted = cards.filter((a) => inSpotlight(a, now));
  } else {
    const supabase = await createClient();
    const nowIso = new Date(now).toISOString();
    const base = () => supabase.from("apps").select(CARD_SELECT()).not("link_checked_at", "is", null);
    const [p, l, b] = await Promise.all([
      base().gt("featured_until", nowIso).order("featured_until", { ascending: false }).limit(8),
      base().lte("launch_at", nowIso).gt("launch_at", new Date(now - DAY_MS).toISOString()).order("launch_at").limit(8),
      base().gt("boosted_until", nowIso).order("boosted_until", { ascending: true }).limit(8),
    ]);
    picked = (p.data ?? []).map(toCard);
    launching = (l.data ?? []).map(toCard);
    // Booked Spotlights that are still waiting in line aren't on yet.
    boosted = (b.data ?? []).map(toCard).filter((a) => inSpotlight(a, now));
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
    .select(CARD_SELECT())
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
    .select(CARD_SELECT())
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
  const rows = (data ?? []) as TopTester[];
  const photos = await photoUrls(rows.map((r) => r.user_id));
  return rows.map((r) => ({
    ...r,
    feedback_count: Number(r.feedback_count),
    helpful_count: Number(r.helpful_count),
    avatar_url: photos.get(r.user_id) ?? null,
  }));
}

// People search on Browse: by username or name.
export async function searchPeople(q: string | undefined, max = 12): Promise<ProfileSummary[]> {
  const needle = (q ?? "").replace(/[^\p{L}\p{N} _-]/gu, " ").trim().slice(0, 40);
  if (needle.length < 2) return [];
  if (!isSupabaseConfigured) {
    const low = needle.toLowerCase();
    return demoProfiles
      .filter((p) => `${p.username} ${p.display_name}`.toLowerCase().includes(low))
      .slice(0, max)
      .map(toSummary);
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select(summaryCols())
    .or(`username.ilike."%${needle}%",display_name.ilike."%${needle}%"`)
    .order("username")
    .limit(max);
  return (data ?? []).map(toSummary);
}

// This month's top builders: tries on their apps plus likes on their Drops
// (x2), from other people. Null until migration 20261003000000 is run.
export async function getTopBuilders(): Promise<TopBuilder[] | null> {
  if (!isSupabaseConfigured) {
    return demoProfiles
      .map((p) => {
        const apps = demoApps.filter((a) => a.owner_id === p.id);
        return {
          user_id: p.id,
          username: p.username,
          display_name: p.display_name,
          avatar_url: null,
          tries: Math.round(apps.reduce((n, a) => n + a.try_count, 0) / 4),
          likes: Math.round(apps.reduce((n, a) => n + a.like_count, 0) / 4),
        };
      })
      .filter((b) => b.tries + b.likes > 0)
      .sort((a, b) => b.tries + 2 * b.likes - (a.tries + 2 * a.likes));
  }
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("top_builders", { p_limit: 10 });
  if (error) return null;
  return ((data ?? []) as { user_id: string; username: string; display_name: string; avatar_path: string | null; tries: number; likes: number }[]).map(
    (r) => ({
      user_id: r.user_id,
      username: r.username,
      display_name: r.display_name,
      avatar_url: publicFileUrl(r.avatar_path),
      tries: Number(r.tries),
      likes: Number(r.likes),
    }),
  );
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
    .select(`id, body, created_at, user:profiles!updates_user_id_fkey(${summaryCols()}), app:apps(slug, name)`)
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
  const { data: apps } = await supabase.from("apps").select(CARD_SELECT()).in("id", otherIds);
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
    .select(`id, kind, created_at, read_at, ref_id, actor:profiles!notifications_actor_id_fkey(${summaryCols()}), app:apps(slug, name)`)
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

const CONNECTION_PEOPLE = () => `id, reason, note, status, created_at, requester_id, addressee_id,
  requester:profiles!connections_requester_id_fkey(${summaryCols()}),
  addressee:profiles!connections_addressee_id_fkey(${summaryCols()})` as const;

export async function getConnectionRequests(viewer: Viewer): Promise<{ received: ConnectionRequest[]; sent: ConnectionRequest[] }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("connections")
    .select(CONNECTION_PEOPLE())
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
  const { data: people } = await supabase.from("profiles").select(summaryCols()).in("id", [...threads.keys()]);
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
  const { data: person } = await supabase.from("profiles").select(summaryCols()).eq("username", username).maybeSingle();
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
// ---------------------------------------------------------------------------
// Q&A: on app pages, in the Questions feed and on a question's own page
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- rows come back untyped without generated types */

// Polls and replies need migration 20261003000000_questions_feed; until it's
// run, questions still work without them. Checked again every minute.
let qaColumns = false;
let qaCheckedAt = 0;
async function checkQaColumns() {
  if (qaColumns || !isSupabaseConfigured || Date.now() - qaCheckedAt < 60_000) return;
  qaCheckedAt = Date.now();
  const supabase = await createClient();
  const [q, a] = await Promise.all([
    supabase.from("questions").select("poll_options, poll_counts").limit(1),
    supabase.from("answers").select("parent_id").limit(1),
  ]);
  qaColumns = !q.error && !a.error;
}
export async function questionsFeedReady(): Promise<boolean> {
  await checkQaColumns();
  return qaColumns;
}

const questionSelect = (withApp: boolean) =>
  `id, body, created_at, vote_count, answer_count, best_answer_id, user_id${qaColumns ? ", poll_options, poll_counts" : ""},
   user:profiles!questions_user_id_fkey(${summaryCols()}),
   answers(id, body, created_at, vote_count${qaColumns ? ", parent_id" : ""}, user:profiles!answers_user_id_fkey(${summaryCols()}))${
     withApp ? ", app:apps!inner(id, slug, name, tagline, category, owner_id, link_checked_at)" : ""
   }`;

type AnswerRow = { id: string; body: string; created_at: string; vote_count: number; parent_id?: string | null; user: unknown };

// Answers first by best, then votes, then oldest; replies sit under the
// answer they reply to, oldest first.
function orderAnswers(answers: Answer[], bestId: string | null): Answer[] {
  const top = answers
    .filter((a) => !a.parent_id)
    .sort(
      (a, b) =>
        Number(b.id === bestId) - Number(a.id === bestId) || b.vote_count - a.vote_count || a.created_at.localeCompare(b.created_at),
    );
  const replies = answers.filter((a) => a.parent_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return top.flatMap((a) => [a, ...replies.filter((r) => r.parent_id === a.id)]);
}

async function viewerQaState(viewer: Viewer | null, rows: any[]) {
  const votedQ = new Set<string>();
  const votedA = new Set<string>();
  const picks = new Map<string, number>();
  if (!viewer || rows.length === 0) return { votedQ, votedA, picks };
  const supabase = await createClient();
  const qIds = rows.map((r) => r.id as string);
  const aIds = rows.flatMap((r) => ((r.answers ?? []) as { id: string }[]).map((a) => a.id));
  const pollIds = rows.filter((r) => r.poll_options).map((r) => r.id as string);
  const [qv, av, pv] = await Promise.all([
    supabase.from("question_votes").select("question_id").eq("user_id", viewer.id).in("question_id", qIds),
    aIds.length ? supabase.from("answer_votes").select("answer_id").eq("user_id", viewer.id).in("answer_id", aIds) : Promise.resolve({ data: [] }),
    pollIds.length ? supabase.from("poll_votes").select("question_id, choice").eq("user_id", viewer.id).in("question_id", pollIds) : Promise.resolve({ data: [] }),
  ]);
  for (const v of (qv.data ?? []) as any[]) votedQ.add(v.question_id);
  for (const v of (av.data ?? []) as any[]) votedA.add(v.answer_id);
  for (const v of (pv.data ?? []) as any[]) picks.set(v.question_id, v.choice);
  return { votedQ, votedA, picks };
}

function toQuestion(row: any, state: Awaited<ReturnType<typeof viewerQaState>>): Question {
  return {
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    vote_count: row.vote_count,
    voted: state.votedQ.has(row.id),
    best_answer_id: row.best_answer_id,
    user: toSummary(row.user),
    poll: row.poll_options ? { options: row.poll_options, counts: row.poll_counts ?? [], mine: state.picks.get(row.id) ?? null } : null,
    answers: orderAnswers(
      ((row.answers ?? []) as AnswerRow[]).map((a) => ({
        id: a.id,
        body: a.body,
        created_at: a.created_at,
        vote_count: a.vote_count,
        parent_id: a.parent_id ?? null,
        voted: state.votedA.has(a.id),
        user: toSummary(a.user),
      })),
      row.best_answer_id,
    ),
  };
}

// Each app's newest Drop poster, one row per app (the same newest-Drop query
// Browse uses), instead of every Drop of every app.
async function latestPosters(appIds: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = [...new Set(appIds)];
  if (ids.length === 0) return out;
  const supabase = await createClient();
  const { data } = await supabase
    .from("apps")
    .select("id, drops(poster_path, created_at)")
    .in("id", ids)
    .order("created_at", { referencedTable: "drops", ascending: false })
    .limit(1, { referencedTable: "drops" });
  for (const a of (data ?? []) as any[]) out.set(a.id, publicFileUrl(a.drops?.[0]?.poster_path ?? null));
  return out;
}

const NO_QA_STATE = { votedQ: new Set<string>(), votedA: new Set<string>(), picks: new Map<string, number>() };

function toQuestionCard(
  row: any,
  state: Awaited<ReturnType<typeof viewerQaState>>,
  posters: Map<string, string | null>,
): QuestionCard {
  return {
    ...toQuestion(row, state),
    answer_count: row.answer_count ?? (row.answers ?? []).length,
    by_builder: row.user_id === row.app.owner_id,
    app: {
      id: row.app.id,
      slug: row.app.slug,
      name: row.app.name,
      tagline: row.app.tagline,
      category: row.app.category,
      owner_id: row.app.owner_id,
      poster_url: posters.get(row.app.id) ?? null,
    },
  };
}

// Sample questions in demo mode, shaped like the real ones.
function demoQuestionCards(): QuestionCard[] {
  return Object.entries(demoQuestions).flatMap(([appId, list]) => {
    const app = demoApps.find((a) => a.id === appId)!;
    return list.map((q, qi) => {
      const answers = q.answers.map((a, ai) => ({
        id: `demo-a-${appId}-${qi}-${ai}`,
        body: a.body,
        created_at: demoCommentDate((q.hours ?? 24 * (2 - qi)) / 24 - (ai + 1) * 0.02),
        vote_count: a.votes,
        voted: false,
        user: toSummary(demoProfile(a.user)),
        parent_id: null as string | null,
      }));
      q.answers.forEach((a, ai) => {
        if (a.replyTo !== undefined) answers[ai].parent_id = answers[a.replyTo].id;
      });
      const best = q.answers.findIndex((a) => a.best);
      const bestId = best >= 0 ? answers[best].id : null;
      return {
        id: `demo-q-${appId}-${qi}`,
        body: q.body,
        created_at: demoCommentDate((q.hours ?? 24 * (2 - qi)) / 24),
        vote_count: q.votes,
        voted: false,
        best_answer_id: bestId,
        user: toSummary(demoProfile(q.user)),
        poll: q.poll ? { ...q.poll, mine: null } : null,
        answers: orderAnswers(answers, bestId),
        answer_count: answers.length,
        by_builder: q.user === app.owner_id,
        app: { id: app.id, slug: app.slug, name: app.name, tagline: app.tagline, category: app.category, owner_id: app.owner_id, poster_url: null },
      };
    });
  });
}

export async function getQuestions(appId: string, viewer: Viewer | null): Promise<Question[]> {
  if (!isSupabaseConfigured) return demoQuestionCards().filter((q) => q.app.id === appId);
  await checkQaColumns();
  const supabase = await createClient();
  const { data } = await supabase
    .from("questions")
    .select(questionSelect(false))
    .eq("app_id", appId)
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = (data ?? []) as any[];
  const state = await viewerQaState(viewer, rows);
  return rows.map((r) => toQuestion(r, state));
}

// One question with its app and whole thread, for /q/[id]. Cached per
// request, so the page and its title share one load.
export const getQuestion = cache(async (id: string, viewer: Viewer | null): Promise<QuestionCard | null> => {
  if (!isSupabaseConfigured) return demoQuestionCards().find((q) => q.id === id) ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  await checkQaColumns();
  const supabase = await createClient();
  const { data } = await supabase.from("questions").select(questionSelect(true)).eq("id", id).not("app.link_checked_at", "is", null).maybeSingle();
  if (!data) return null;
  const [state, posters] = await Promise.all([viewerQaState(viewer, [data]), latestPosters([(data as any).app.id])]);
  return toQuestionCard(data, state, posters);
});

// The Questions tab in Drops: recent questions ranked for this person. Fresh
// ones and ones still waiting for answers come first, then builders asking
// about their own app, polls, and the categories they're into.
export async function getQuestionFeed(viewer: Viewer | null, interests: Interests = {}): Promise<QuestionCard[]> {
  if (!isSupabaseConfigured) return rankQuestions(demoQuestionCards(), { interests }).slice(0, 30);
  await checkQaColumns();
  const supabase = await createClient();
  const [{ data }, learned] = await Promise.all([
    supabase
      .from("questions")
      .select(questionSelect(true))
      .not("app.link_checked_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(100)
      // The card previews one answer, so the top 10 by votes is plenty.
      .order("vote_count", { referencedTable: "answers", ascending: false })
      .limit(10, { referencedTable: "answers" }),
    viewer ? viewerInterests(viewer.id) : Promise.resolve({}),
  ]);
  const rows = (data ?? []) as any[];
  // Rank first (it only needs the rows), then load votes and posters for the
  // 30 questions that make the page.
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const ranked = rankQuestions(
    rows.map((r) => toQuestionCard(r, NO_QA_STATE, new Map())),
    { interests: mergeInterests(interests, learned), viewerId: viewer?.id },
  ).slice(0, 30);
  const page = ranked.map((q) => byId.get(q.id));
  const [state, posters] = await Promise.all([viewerQaState(viewer, page), latestPosters(page.map((r) => r.app.id))]);
  return page.map((r) => toQuestionCard(r, state, posters));
}

// ---------------------------------------------------------------------------
// Builders like you
// ---------------------------------------------------------------------------

export async function getSuggestions(viewer: Viewer | null): Promise<Suggestion[]> {
  if (!isSupabaseConfigured) {
    return [
      { ...toSummary(demoProfile("demo-june")), shared_categories: ["design"], shared_skills: ["React"] },
      { ...toSummary(demoProfile("demo-marco")), shared_categories: ["education", "productivity"], shared_skills: [] },
    ];
  }
  if (!viewer) return [];
  const supabase = await createClient();
  const { data } = await supabase.rpc("suggest_builders", { p_limit: SUGGESTION_LIMIT });
  const rows = (data ?? []) as Suggestion[];
  // suggest_builders doesn't return photos.
  const photos = await photoUrls(rows.map((r) => r.id));
  const matched: Suggestion[] = rows.map((r) => ({
    ...toSummary(r),
    avatar_url: photos.get(r.id) ?? null,
    shared_categories: r.shared_categories ?? [],
    shared_skills: r.shared_skills ?? [],
  }));
  if (matched.length >= SUGGESTION_LIMIT) return matched;

  // Not enough in common yet: fill with the newest builders.
  const { data: fresh } = await supabase
    .from("profiles")
    .select(summaryCols())
    .neq("id", viewer.id)
    .order("created_at", { ascending: false })
    .limit(40);
  const newest = (fresh ?? []).map((r) => ({ ...toSummary(r), shared_categories: [], shared_skills: [] }));
  if (newest.length === 0) return matched;
  const { data: followed } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", viewer.id)
    .in("following_id", newest.map((p) => p.id));
  return topUpSuggestions(matched, newest, [viewer.id, ...(followed ?? []).map((f) => f.following_id as string)]);
}

// ---------------------------------------------------------------------------
// Phase 4: Earn
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- rows come back untyped without generated types */

// The server's clock for pages that compare against it (kept out of render
// code for the React Compiler's purity rules).
export function nowMs(): number {
  return Date.now();
}

export function isPro(profile: { pro_until: string | null } | null | undefined, now = Date.now()): boolean {
  return Boolean(profile?.pro_until && new Date(profile.pro_until).getTime() > now);
}

function demoSponsorCard(hostId: string): SponsorCard | null {
  const id = demoSponsors[hostId];
  const sponsor = demoApps.find((a) => a.id === id);
  if (sponsor) return { id: `demo-deal-${hostId}`, kind: "app", slug: sponsor.slug, name: sponsor.name, tagline: sponsor.tagline };
  const brand = demoBrands.find((b) => b.id === id);
  return brand ? { id: `demo-deal-${hostId}`, kind: "brand", slug: brand.slug, name: brand.name, tagline: brand.tagline } : null;
}

// "Sponsored by" cards for running Boost Exchange deals, keyed by host app.
export async function getSponsorCards(hostIds: string[]): Promise<Map<string, SponsorCard>> {
  const out = new Map<string, SponsorCard>();
  const ids = [...new Set(hostIds)];
  if (ids.length === 0) return out;
  if (!isSupabaseConfigured) {
    for (const id of ids) {
      const card = demoSponsorCard(id);
      if (card) out.set(id, card);
    }
    return out;
  }
  const supabase = await createClient();
  const { data } = await supabase.rpc("active_sponsors", { p_hosts: ids });
  for (const row of (data ?? []) as any[]) {
    out.set(row.host_app, {
      id: row.sponsorship_id,
      kind: row.sponsor_kind === "brand" ? "brand" : "app",
      slug: row.sponsor_slug,
      name: row.sponsor_name,
      tagline: row.sponsor_tagline,
    });
  }
  return out;
}

// --- Backers ---

export async function getBackers(appId: string): Promise<Backer[]> {
  if (!isSupabaseConfigured) {
    return (demoBackers[appId] ?? []).map((b, i) => ({
      id: `${appId}-backer-${i}`,
      note: b.note,
      created_at: demoDay(b.days),
      user: toSummary(demoProfile(b.user)),
    }));
  }
  const supabase = await createClient();
  const { data } = await supabase
    .from("backings")
    .select(`id, note, created_at, user:profiles!backings_user_id_fkey(${summaryCols()})`)
    .eq("app_id", appId)
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(30);
  return (data ?? []).map((r: any) => ({ id: r.id, note: r.note, created_at: r.created_at, user: toSummary(r.user) }));
}

// --- Sponsorships, earnings, Pro ---

export async function getMySponsorships(viewer: Viewer): Promise<Sponsorship[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sponsorships")
    .select(
      `id, status, price_cents, budget_cents, spent_cents, tries, message, created_at, started_at, sponsor_user,
       sponsor:apps!sponsorships_sponsor_app_fkey(id, slug, name), host:apps!sponsorships_host_app_fkey(id, slug, name),
       brand:brands!sponsorships_sponsor_brand_fkey(id, slug, name)`,
    )
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((r: any) => ({
    id: r.id,
    status: r.status,
    price_cents: r.price_cents,
    budget_cents: r.budget_cents,
    spent_cents: r.spent_cents,
    tries: r.tries,
    message: r.message ?? "",
    created_at: r.created_at,
    started_at: r.started_at,
    sponsor: r.sponsor ? { ...r.sponsor, kind: "app" } : r.brand ? { ...r.brand, kind: "brand" } : null,
    host: r.host ?? null,
    mine: r.sponsor_user === viewer.id ? "sponsor" : "host",
  }));
}

// The sponsorship packages an app offers (all of them for its builder, to edit).
export async function getSponsorPackages(appId: string, includeOff = false): Promise<SponsorPackage[]> {
  if (!isSupabaseConfigured) {
    // Demo: every app offers a card and a video so the flow can be tried.
    return [
      { kind: "card", price_cents: 2500, note: "", active: true },
      { kind: "video", price_cents: 8000, note: "TikTok · 8k followers", active: true },
    ];
  }
  const supabase = await createClient();
  let query = supabase.from("sponsor_packages").select("kind, price_cents, note, active").eq("app_id", appId);
  if (!includeOff) query = query.eq("active", true);
  const { data, error } = await query;
  // Null-safe until migration 20261008000000_sponsor_packages.sql is run.
  if (error) return [];
  const order = ["card", "drop", "site", "video", "newsletter"];
  return ((data ?? []) as SponsorPackage[]).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

// Runs the time-based steps (expired requests refunded, unapproved deliveries
// approved, finished Sponsored cards paid), then lists your package deals.
export async function getMyPackageDeals(viewer: Viewer): Promise<PackageDeal[]> {
  const supabase = await createClient();
  await supabase.rpc("settle_package_deals");
  const { data, error } = await supabase
    .from("package_deals")
    .select(
      `id, kind, status, price_cents, fee_cents, brief, proof_url, problem, card_until, created_at, paid_at, delivered_at, sponsor_user,
       host:apps!package_deals_host_app_fkey(slug, name),
       sp_app:apps!package_deals_sponsor_app_fkey(slug, name),
       sp_brand:brands!package_deals_sponsor_brand_fkey(slug, name),
       host_profile:profiles!package_deals_host_user_fkey(username),
       sponsor_profile:profiles!package_deals_sponsor_user_fkey(username)`,
    )
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return [];
  return (data ?? []).map((r: any) => {
    const mine = r.sponsor_user === viewer.id ? "sponsor" : "host";
    return {
      id: r.id,
      kind: r.kind,
      status: r.status,
      price_cents: r.price_cents,
      fee_cents: r.fee_cents,
      brief: r.brief ?? "",
      proof_url: r.proof_url,
      problem: r.problem ?? "",
      card_until: r.card_until,
      created_at: r.created_at,
      paid_at: r.paid_at,
      delivered_at: r.delivered_at,
      host: r.host ?? null,
      sponsor: r.sp_app ? { ...r.sp_app, kind: "app" } : r.sp_brand ? { ...r.sp_brand, kind: "brand" } : null,
      other: (mine === "sponsor" ? r.host_profile?.username : r.sponsor_profile?.username) ?? null,
      mine,
    };
  });
}

export async function getEarnings(viewer: Viewer): Promise<Earnings> {
  const supabase = await createClient();
  const [balance, events, payouts, account, profile] = await Promise.all([
    supabase.rpc("my_earnings_balance"),
    supabase
      .from("earnings")
      .select("id, delta_cents, kind, created_at, app:apps(slug, name)")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase.from("payouts").select("id, amount_cents, status, created_at").order("created_at", { ascending: false }).limit(10),
    supabase.from("payout_accounts").select("payouts_enabled").eq("user_id", viewer.id).maybeSingle(),
    supabase.from("profiles").select("pro_until").eq("id", viewer.id).maybeSingle(),
  ]);
  return {
    balance: (balance.data as number | null) ?? 0,
    events: (events.data ?? []).map((e: any) => ({
      id: e.id,
      delta_cents: e.delta_cents,
      kind: e.kind,
      created_at: e.created_at,
      app: e.app ? { slug: e.app.slug, name: e.app.name } : null,
    })),
    payouts: payouts.data ?? [],
    account: !account.data ? "none" : account.data.payouts_enabled ? "ready" : "pending",
    pro_until: profile.data?.pro_until ?? null,
  };
}

// --- Challenges ---

function demoChallenge(c: (typeof demoChallenges)[number], now = Date.now()): Challenge {
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    body: c.body,
    sponsor_name: c.sponsor_name,
    sponsor_url: c.sponsor_url,
    prize: c.prize,
    stack: c.stack,
    category: c.category,
    starts_at: new Date(now + c.startsDays * DAY_MS).toISOString(),
    ends_at: new Date(now + c.endsDays * DAY_MS).toISOString(),
    winner_entry_id: null,
    entry_count: c.entries.length,
  };
}

const CHALLENGE_FIELDS = "id, slug, title, body, sponsor_name, sponsor_url, prize, stack, category, starts_at, ends_at, winner_entry_id, entry_count";

export async function getChallenges(): Promise<Challenge[]> {
  if (!isSupabaseConfigured) return demoChallenges.map((c) => demoChallenge(c));
  const supabase = await createClient();
  const { data } = await supabase.from("challenges").select(CHALLENGE_FIELDS).order("ends_at", { ascending: false }).limit(30);
  return (data ?? []) as Challenge[];
}

// The challenge running right now (the one ending soonest), for the banner at
// the top of Home. Null when none is on.
export async function getRunningChallenge(): Promise<Challenge | null> {
  const now = Date.now();
  if (!isSupabaseConfigured) {
    return (
      demoChallenges
        .map((c) => demoChallenge(c, now))
        .filter((c) => new Date(c.starts_at).getTime() <= now && now < new Date(c.ends_at).getTime())
        .sort((a, b) => a.ends_at.localeCompare(b.ends_at))[0] ?? null
    );
  }
  const at = new Date(now).toISOString();
  const supabase = await createClient();
  const { data } = await supabase
    .from("challenges")
    .select(CHALLENGE_FIELDS)
    .lte("starts_at", at)
    .gt("ends_at", at)
    .order("ends_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as Challenge | null) ?? null;
}

export async function getChallenge(
  slug: string,
  viewer: Viewer | null,
): Promise<{ challenge: Challenge; entries: ChallengeEntry[]; votedFor: string | null } | null> {
  if (!isSupabaseConfigured) {
    const c = demoChallenges.find((x) => x.slug === slug);
    if (!c) return null;
    const cards = demoCards();
    const entries = c.entries
      .map((e) => ({ id: e.id, vote_count: e.votes, app: cards.find((a) => a.id === e.app)! }))
      .sort((a, b) => b.vote_count - a.vote_count);
    return { challenge: demoChallenge(c), entries, votedFor: null };
  }
  const supabase = await createClient();
  const { data: challenge } = await supabase.from("challenges").select(CHALLENGE_FIELDS).eq("slug", slug).maybeSingle();
  if (!challenge) return null;
  const [{ data: rows }, vote] = await Promise.all([
    supabase
      .from("challenge_entries")
      .select(`id, vote_count, app:apps!inner(${CARD_SELECT()})`)
      .eq("challenge_id", challenge.id)
      .order("vote_count", { ascending: false })
      .order("created_at", { ascending: true })
      .limit(100),
    viewer
      ? supabase.from("challenge_votes").select("entry_id").eq("challenge_id", challenge.id).eq("user_id", viewer.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    challenge: challenge as Challenge,
    entries: (rows ?? []).map((r: any) => ({ id: r.id, vote_count: r.vote_count, app: toCard(r.app) })),
    votedFor: (vote.data as { entry_id: string } | null)?.entry_id ?? null,
  };
}

/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------------------------------------------------------------------------
// Phase 5: Scale
// ---------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-explicit-any -- rows come back untyped without generated types */

const BRAND_FIELDS = "id, owner_id, slug, name, tagline, description, url, link_checked_at, verified_at, created_at";

function toBrand(row: any): Brand {
  return {
    id: row.id,
    owner_id: row.owner_id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description ?? "",
    url: row.url,
    verified: Boolean(row.verified_at),
    live: Boolean(row.link_checked_at),
    created_at: row.created_at,
  };
}

const demoBrandList = (): Brand[] =>
  demoBrands.map((b) => ({ ...b, verified: b.verified, live: true }));

// Live brands, verified ones first.
export async function getBrands(): Promise<Brand[]> {
  if (!isSupabaseConfigured) return demoBrandList();
  const supabase = await createClient();
  const { data } = await supabase
    .from("brands")
    .select(BRAND_FIELDS)
    .not("link_checked_at", "is", null)
    .order("verified_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(60);
  return (data ?? []).map(toBrand);
}

export async function getMyBrands(viewer: Viewer | null): Promise<Brand[]> {
  if (!viewer) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select(BRAND_FIELDS).eq("owner_id", viewer.id).order("created_at");
  return (data ?? []).map(toBrand);
}

// A brand and the apps it's sponsoring right now.
export async function getBrand(slug: string): Promise<{ brand: Brand; sponsoring: AppCard[] } | null> {
  if (!isSupabaseConfigured) {
    const brand = demoBrandList().find((b) => b.slug === slug);
    if (!brand) return null;
    const hosts = Object.entries(demoSponsors).filter(([, s]) => s === brand.id).map(([h]) => h);
    return { brand, sponsoring: demoCards().filter((c) => hosts.includes(c.id)) };
  }
  const supabase = await createClient();
  const { data } = await supabase.from("brands").select(BRAND_FIELDS).eq("slug", slug).maybeSingle();
  if (!data) return null;
  const { data: rows } = await supabase.rpc("brand_sponsoring", { p_brand: data.id });
  const ids = ((rows ?? []) as { app_id: string }[]).map((r) => r.app_id);
  let sponsoring: AppCard[] = [];
  if (ids.length > 0) {
    const { data: apps } = await supabase.from("apps").select(CARD_SELECT()).in("id", ids);
    sponsoring = (apps ?? []).map(toCard);
  }
  return { brand: toBrand(data), sponsoring };
}

// Builder analytics: daily numbers and where tries came from.
export async function getAnalytics(appId: string, days: number): Promise<Analytics | { error: string }> {
  if (!isSupabaseConfigured) {
    // A made-up 90-day curve, scaled so it adds up to most of the app's real
    // demo try count, then cut to the range asked for.
    const base = Date.UTC(2026, 8, 23);
    const curve = Array.from({ length: 90 }, (_, i) => 10 + 7 * Math.sin(i / 4) + (i / 90) * 8);
    const allTime = demoApps.find((a) => a.id === appId)?.try_count ?? 100;
    const scale = (allTime * 0.8) / curve.reduce((n, v) => n + v, 0);
    const daily = curve.slice(90 - days).map((v, i) => {
      const t = days - 1 - i;
      const tries = Math.round(v * scale);
      return {
        day: new Date(base - t * DAY_MS).toISOString().slice(0, 10),
        tries,
        sponsored: t < 9 ? Math.round(tries / 3) : 0,
        likes: Math.round(tries / 2.5),
        feedback: i % 5 === 0 && tries > 2 ? 1 : 0,
      };
    });
    const total = daily.reduce((n, d) => n + d.tries, 0);
    const split: [string, number][] = [["feed", 0.38], ["page", 0.22], ["embed", 0.14], ["card", 0.1], ["share", 0.08], ["direct", 0.05], ["api", 0.03]];
    return { days, daily, sources: split.map(([source, f]) => ({ source, tries: Math.round(total * f) })).filter((x) => x.tries > 0) };
  }
  const supabase = await createClient();
  const [daily, sources] = await Promise.all([
    supabase.rpc("app_daily", { p_app: appId, p_days: days }),
    supabase.rpc("app_sources", { p_app: appId, p_days: days }),
  ]);
  const error = daily.error ?? sources.error;
  if (error) return { error: error.code === "P0001" ? error.message : "Couldn't load stats." };
  return { days, daily: (daily.data ?? []) as Analytics["daily"], sources: (sources.data ?? []) as Analytics["sources"] };
}

/* eslint-enable @typescript-eslint/no-explicit-any */
