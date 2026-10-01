// Everything the app reads and writes. Talks to Supabase directly as the
// signed-in person (row level security applies, exactly as on the website),
// and to the website only for posting, which needs the server's link check.
// In demo mode it returns the website's own sample data.

import { File, UploadType } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";

import { CATEGORIES, OFFICIAL_HANDLE, ROLES, isOneOf } from "@shared/constants";
import { parseList } from "@shared/format";
import {
  demoApps,
  demoBrands,
  demoCommentDate,
  demoDrops,
  demoFeaturedIds,
  demoProfiles,
  demoQuestions,
  demoSponsors,
} from "@shared/demo";
import type {
  Answer,
  App,
  AppCard,
  AppDetail,
  Drop,
  FeaturedApp,
  FeaturedReason,
  FeedItem,
  Profile,
  ProfileDrop,
  Promotion,
  ProfileSummary,
  QuestionCard,
  SponsorCard,
  Suggestion,
  TopBuilder,
  TopTester,
} from "@shared/types";
import { PROFILE_COLUMNS } from "@shared/types";

import { SIGNALS, bumpInterest, mergeInterests, rankFeed, rankQuestions, type Interests } from "@shared/interests";
import { STAGE_SPOTS, dailyPicks, paidOrder, stageDay, stageOrder } from "@shared/spotlight-stage";
import { SUGGESTION_LIMIT, setUpFirst, topUpSuggestions } from "@shared/suggest";

import { DEMO_MESSAGE, DROPS_BUCKET, SITE_URL, SUPABASE_KEY, SUPABASE_URL, fileUrl } from "./config";
import { dbMessage } from "@shared/db-errors";
import { USERNAME_HINT, USERNAME_PATTERN, isDefaultUsername } from "@shared/username";
import { fail, friendly, ok, type Result } from "./result";
import { supabase } from "./supabase";

/* eslint-disable @typescript-eslint/no-explicit-any -- rows come back untyped */

const SUMMARY = "id, username, display_name, roles, avatar_path";
const CARD_SELECT = `*, owner:profiles!apps_owner_id_fkey(${SUMMARY}), drops(poster_path, created_at)`;
const DAY = 24 * 60 * 60 * 1000;
// How many recent Drops "For you" ranks to pick its page from.
const FOR_YOU_POOL = 200;

const toSummary = (row: any): ProfileSummary => ({
  id: row.id,
  username: row.username,
  display_name: row.display_name ?? "",
  roles: row.roles ?? [],
  avatar_url: fileUrl(row.avatar_path),
});

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
    cover_path: row.cover_path ?? null,
    created_at: row.created_at,
  };
}

function toCard(row: any): AppCard {
  const latest = [...(row.drops ?? [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0];
  // The builder's cover image, or else the frame from their latest Drop.
  return { ...toApp(row), owner: toSummary(row.owner), poster_url: fileUrl(row.cover_path ?? latest?.poster_path) };
}

function toDrop(row: any): Drop {
  return {
    id: row.id,
    app_id: row.app_id,
    owner_id: row.owner_id,
    video_url: fileUrl(row.video_path),
    poster_url: fileUrl(row.poster_path),
    duration_seconds: Number(row.duration_seconds),
    caption: row.caption ?? "",
    like_count: row.like_count ?? 0,
    comment_count: row.comment_count ?? 0,
    created_at: row.created_at,
  };
}

const demoProfile = (id: string) => demoProfiles.find((p) => p.id === id)!;
const demoCards = (): AppCard[] => demoApps.map((a) => ({ ...a, owner: toSummary(demoProfile(a.owner_id)), poster_url: null }));

function demoSponsor(hostId: string): SponsorCard | null {
  const id = demoSponsors[hostId];
  const app = demoApps.find((a) => a.id === id);
  if (app) return { id: `demo-${hostId}`, kind: "app", slug: app.slug, name: app.name, tagline: app.tagline };
  const brand = demoBrands.find((b) => b.id === id);
  return brand ? { id: `demo-${hostId}`, kind: "brand", slug: brand.slug, name: brand.name, tagline: brand.tagline } : null;
}

async function sponsorCards(hostIds: string[]): Promise<Map<string, SponsorCard>> {
  const out = new Map<string, SponsorCard>();
  if (!supabase || hostIds.length === 0) return out;
  const { data } = await supabase.rpc("active_sponsors", { p_hosts: [...new Set(hostIds)] });
  for (const r of (data ?? []) as any[]) {
    out.set(r.host_app, {
      id: r.sponsorship_id,
      kind: r.sponsor_kind === "brand" ? "brand" : "app",
      slug: r.sponsor_slug,
      name: r.sponsor_name,
      tagline: r.sponsor_tagline,
    });
  }
  return out;
}

async function likedIds(viewerId: string | null, dropIds: string[]): Promise<Set<string>> {
  if (!supabase || !viewerId || dropIds.length === 0) return new Set();
  const { data } = await supabase.from("likes").select("drop_id").eq("user_id", viewerId).in("drop_id", dropIds);
  return new Set((data ?? []).map((r: any) => r.drop_id as string));
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

// Home: Featured (picked by the team, launching today, or in the Spotlight, else
// what's hot this month), builders to follow, then the newest projects.
// Everything else is on Browse.
export async function getHome(
  viewerId: string | null,
): Promise<{ featured: FeaturedApp[]; suggestions: Suggestion[]; newest: AppCard[]; builders: TopBuilder[]; testers: TopTester[] }> {
  if (!supabase) {
    const cards = demoCards();
    return {
      ...demoLeaderboards(),
      featured: demoFeaturedIds.map((id) => ({ ...cards.find((c) => c.id === id)!, reason: "featured" as const })).filter((a) => a.id),
      newest: [...cards].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10),
      suggestions: [
        { ...toSummary(demoProfile("demo-june")), shared_categories: ["design"], shared_skills: ["React"] },
        { ...toSummary(demoProfile("demo-marco")), shared_categories: ["education", "productivity"], shared_skills: [] },
      ],
    };
  }
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  // The Spotlight stage, same rules as the website (src/lib/spotlight-stage.ts):
  // paid Spotlights first, then the team's picks and launch days, then
  // Today's picks while the team has them on.
  const fill = Boolean(await getPromotion("spotlight_fill"));
  const base = () => supabase!.from("apps").select(CARD_SELECT).not("link_checked_at", "is", null);
  const [team, launching, boosted, everyone, suggested, newest] = await Promise.all([
    base().gt("featured_until", now).order("featured_until", { ascending: false }).limit(8),
    base().lte("launch_at", now).gt("launch_at", new Date(nowMs - DAY).toISOString()).order("launch_at").limit(8),
    base().gt("boosted_until", now).order("boosted_until", { ascending: true }).limit(8),
    fill ? base().order("created_at", { ascending: false }).limit(300) : Promise.resolve({ data: [] }),
    viewerId ? supabase.rpc("suggest_builders", { p_limit: SUGGESTION_LIMIT }) : Promise.resolve({ data: [] }),
    supabase.from("apps").select(CARD_SELECT).not("link_checked_at", "is", null).order("created_at", { ascending: false }).limit(10),
  ]);
  // A Spotlight booked for later (waiting in line) isn't on yet.
  const at = (t: string | null) => (t ? new Date(t).getTime() : 0);
  const paid = (boosted.data ?? []).filter((r: any) => !r.boosted_from || at(r.boosted_from) <= nowMs);
  let top: FeaturedApp[] = stageOrder<AppCard, FeaturedReason>([
    { apps: paidOrder(paid.map(toCard)), reason: "boosted" },
    { apps: (team.data ?? []).map(toCard), reason: "featured" },
    { apps: (launching.data ?? []).map(toCard), reason: "launch" },
  ]);
  if (fill && top.length < STAGE_SPOTS) {
    const taken = new Set(top.map((a) => a.id));
    const open = (everyone.data ?? []).map(toCard).filter((a) => !taken.has(a.id));
    const pictured = open.filter((a) => a.poster_url);
    const need = STAGE_SPOTS - top.length;
    top = [...top, ...dailyPicks(pictured.length >= need ? pictured : open, need, stageDay(nowMs)).map((a) => ({ ...a, reason: "pick" as const }))];
  }
  if (top.length === 0) {
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const { data } = await supabase
      .from("apps")
      .select(CARD_SELECT)
      .not("link_checked_at", "is", null)
      .gt("created_at", since)
      .order("try_count", { ascending: false })
      .limit(6);
    top = (data ?? []).map((r) => ({ ...toCard(r), reason: "hot" as const }));
  }
  // suggest_builders doesn't return photos: look them up.
  const suggestedRows = (suggested.data ?? []) as any[];
  const photos = new Map<string, string | null>();
  if (suggestedRows.length > 0) {
    const { data: pics } = await supabase.from("profiles").select("id, avatar_path").in("id", suggestedRows.map((r) => r.id));
    for (const p of (pics ?? []) as any[]) photos.set(p.id, p.avatar_path);
  }
  let suggestions = suggestedRows.map((r) => ({
    ...toSummary({ ...r, avatar_path: photos.get(r.id) ?? null }),
    shared_categories: r.shared_categories ?? [],
    shared_skills: r.shared_skills ?? [],
  }));
  // Not enough in common yet: fill with the newest builders (same as the website).
  if (viewerId && suggestions.length < SUGGESTION_LIMIT) {
    const { data: fresh } = await supabase
      .from("profiles")
      .select(SUMMARY)
      .neq("id", viewerId)
      .order("created_at", { ascending: false })
      .limit(40);
    const newestPeople = setUpFirst(((fresh ?? []) as any[]).map((r) => ({ ...toSummary(r), shared_categories: [], shared_skills: [] })));
    if (newestPeople.length > 0) {
      const { data: followed } = await supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", viewerId)
        .in("following_id", newestPeople.map((p) => p.id));
      suggestions = topUpSuggestions(suggestions, newestPeople, [viewerId, ...((followed ?? []) as any[]).map((f) => f.following_id as string)]);
    }
  }
  return { featured: top, suggestions, newest: (newest.data ?? []).map(toCard), ...(await getLeaderboards()) };
}

// "For you": recent Drops ranked by how new and popular they are and what
// this person is into (learned on the device, plus their likes, comments,
// feedback and follows when signed in). Same ranking as the website.
export async function getFeed(viewerId: string | null, interests: Interests = {}): Promise<FeedItem[]> {
  if (!supabase) {
    const items = demoDrops.map((d) => {
      const app = demoApps.find((a) => a.id === d.app_id)!;
      return { ...d, app, owner: toSummary(demoProfile(d.owner_id)), liked: false, sponsor: demoSponsor(app.id) };
    });
    return rankFeed(items, { interests });
  }
  const [{ data, error }, following, learned] = await Promise.all([
    supabase
      .from("drops")
      .select(
        `id, app_id, owner_id, video_path, poster_path, duration_seconds, caption, like_count, comment_count, created_at,
         app:apps!inner(id, slug, name, tagline, category, try_count, link_checked_at),
         owner:profiles!drops_owner_id_fkey(${SUMMARY})`,
      )
      .not("app.link_checked_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(FOR_YOU_POOL),
    viewerId ? followingIds(viewerId) : Promise.resolve(new Set<string>()),
    viewerId ? viewerInterests(viewerId) : Promise.resolve({}),
  ]);
  if (error) throw new Error("Couldn't load Drops.");
  const rows = (data ?? []) as any[];
  const liked = await likedIds(viewerId, rows.map((r) => r.id));
  const all = rows.map((r) => ({
    ...toDrop(r),
    app: { id: r.app.id, slug: r.app.slug, name: r.app.name, tagline: r.app.tagline, category: r.app.category, try_count: r.app.try_count },
    owner: toSummary(r.owner),
    liked: liked.has(r.id),
  }));
  const page = rankFeed(all, { interests: mergeInterests(interests, learned), following, viewerId }).slice(0, 30);
  const sponsors = await sponsorCards(page.map((d) => d.app_id));
  return page.map((d) => ({ ...d, sponsor: sponsors.get(d.app_id) ?? null }));
}

async function followingIds(viewerId: string): Promise<Set<string>> {
  const { data } = await supabase!.from("follows").select("following_id").eq("follower_id", viewerId);
  return new Set((data ?? []).map((f: any) => f.following_id as string));
}

// What a signed-in person's likes, comments and feedback say they're into.
async function viewerInterests(viewerId: string): Promise<Interests> {
  const [likes, comments, feedback] = await Promise.all([
    supabase!.from("likes").select("drop:drops(app:apps(category))").eq("user_id", viewerId).order("created_at", { ascending: false }).limit(100),
    supabase!.from("comments").select("drop:drops(app:apps(category))").eq("user_id", viewerId).order("created_at", { ascending: false }).limit(50),
    supabase!.from("feedback").select("app:apps(category)").eq("user_id", viewerId).order("created_at", { ascending: false }).limit(50),
  ]);
  let out: Interests = {};
  const add = (category: unknown, amount: number) => {
    if (typeof category === "string") out = bumpInterest(out, category, amount);
  };
  for (const row of (likes.data ?? []) as any[]) add(row.drop?.app?.category, SIGNALS.liked);
  for (const row of (comments.data ?? []) as any[]) add(row.drop?.app?.category, SIGNALS.comments);
  for (const row of (feedback.data ?? []) as any[]) add(row.app?.category, SIGNALS.feedback);
  return out;
}

export async function browseApps({ q, category }: { q?: string; category?: string }): Promise<AppCard[]> {
  const cat = isOneOf(CATEGORIES, category) ? category : undefined;
  const needle = q?.trim().slice(0, 100);
  if (!supabase) {
    const n = needle?.toLowerCase();
    return demoCards()
      .filter((a) => !cat || a.category === cat)
      .filter((a) => !n || `${a.name} ${a.tagline} ${a.description}`.toLowerCase().includes(n));
  }
  let query = supabase
    .from("apps")
    .select(CARD_SELECT)
    .not("link_checked_at", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);
  if (cat) query = query.eq("category", cat);
  if (needle) query = query.textSearch("search", needle, { type: "websearch", config: "english" });
  const { data } = await query;
  return (data ?? []).map(toCard);
}

export async function getAppDetail(slug: string, viewerId: string | null): Promise<{ app: AppDetail } | null> {
  if (!supabase) {
    const found = demoApps.find((a) => a.slug === slug);
    if (!found) return null;
    const drop = demoDrops.find((d) => d.app_id === found.id) ?? null;
    return { app: { ...found, owner: toSummary(demoProfile(found.owner_id)), drop, liked: false, sponsor: demoSponsor(found.id) } };
  }
  const { data: row } = await supabase
    .from("apps")
    .select(`*, owner:profiles!apps_owner_id_fkey(${SUMMARY})`)
    .eq("slug", slug)
    .not("link_checked_at", "is", null)
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
    drop ? likedIds(viewerId, [drop.id]) : Promise.resolve(new Set<string>()),
    sponsorCards([row.id]),
  ]);
  return {
    app: { ...toApp(row), owner: toSummary(row.owner), drop, liked: drop ? liked.has(drop.id) : false, sponsor: sponsors.get(row.id) ?? null },
  };
}

export async function getProfileBundle(
  username: string,
  viewerId: string | null,
): Promise<{ profile: Profile; apps: AppCard[]; drops: ProfileDrop[]; following: boolean } | null> {
  if (!supabase) {
    const profile = demoProfiles.find((p) => p.username === username);
    if (!profile) return null;
    const drops = demoDrops
      .filter((d) => d.owner_id === profile.id)
      .map((d) => {
        const app = demoApps.find((a) => a.id === d.app_id)!;
        return { ...d, app: { id: app.id, slug: app.slug, name: app.name, category: app.category }, image_url: d.poster_url };
      });
    return { profile, apps: demoCards().filter((a) => a.owner_id === profile.id), drops, following: false };
  }
  const { data: profile } = await supabase.from("profiles").select(PROFILE_COLUMNS).eq("username", username).maybeSingle();
  if (!profile) return null;
  const [apps, dropRows, follow] = await Promise.all([
    supabase.from("apps").select(CARD_SELECT).eq("owner_id", profile.id).not("link_checked_at", "is", null).order("created_at", { ascending: false }),
    supabase
      .from("drops")
      .select("*, app:apps!inner(id, slug, name, category, cover_path, link_checked_at)")
      .eq("owner_id", profile.id)
      .not("app.link_checked_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(24),
    viewerId && viewerId !== profile.id
      ? supabase.from("follows").select("follower_id").eq("follower_id", viewerId).eq("following_id", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  // Their Drops, newest first; the tile shows the Drop's frame, else the app's card picture.
  const drops: ProfileDrop[] = (dropRows.data ?? []).map((row) => {
    const app = row.app as unknown as ProfileDrop["app"] & { cover_path: string | null };
    const drop = toDrop(row);
    return { ...drop, app: { id: app.id, slug: app.slug, name: app.name, category: app.category }, image_url: drop.poster_url ?? fileUrl(app.cover_path ?? null) };
  });
  return { profile: profile as Profile, apps: (apps.data ?? []).map(toCard), drops, following: Boolean(follow.data) };
}

// ---------------------------------------------------------------------------
// Leaderboards (on Home): this month's top builders and top testers
// ---------------------------------------------------------------------------

// Same numbers as the website's Home.
function demoLeaderboards(): { builders: TopBuilder[]; testers: TopTester[] } {
  const builders = demoProfiles
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
  const testers = demoProfiles
    .map((p) => ({
      user_id: p.id,
      username: p.username,
      display_name: p.display_name,
      avatar_url: null,
      feedback_count: Math.round(p.feedback_given_count / 3),
      helpful_count: Math.round(p.feedback_helpful_count / 3),
    }))
    .sort((a, b) => b.helpful_count - a.helpful_count || b.feedback_count - a.feedback_count);
  return { builders, testers };
}

async function getLeaderboards(): Promise<{ builders: TopBuilder[]; testers: TopTester[] }> {
  const [b, t] = await Promise.all([supabase!.rpc("top_builders", { p_limit: 10 }), supabase!.rpc("top_testers", { p_limit: 10 })]);
  const testerRows = (t.data ?? []) as any[];
  // top_testers doesn't return photos: look them up.
  const photos = new Map<string, string | null>();
  if (testerRows.length > 0) {
    const { data } = await supabase!.from("profiles").select("id, avatar_path").in("id", testerRows.map((r) => r.user_id));
    for (const p of (data ?? []) as any[]) photos.set(p.id, fileUrl(p.avatar_path));
  }
  return {
    builders: ((b.data ?? []) as any[]).map((r) => ({
      user_id: r.user_id,
      username: r.username,
      display_name: r.display_name ?? "",
      avatar_url: fileUrl(r.avatar_path),
      tries: Number(r.tries),
      likes: Number(r.likes),
    })),
    testers: testerRows.map((r) => ({
      user_id: r.user_id,
      username: r.username,
      display_name: r.display_name ?? "",
      avatar_url: photos.get(r.user_id) ?? null,
      feedback_count: Number(r.feedback_count),
      helpful_count: Number(r.helpful_count),
    })),
  };
}

// ---------------------------------------------------------------------------
// Questions (the Questions side of Drops, and a question's thread)
// ---------------------------------------------------------------------------

const QUESTION_BASE = `id, app_id, body, created_at, vote_count, answer_count, best_answer_id, user_id, poll_options, poll_counts,
  user:profiles!questions_user_id_fkey(${SUMMARY}),
  answers!answers_question_id_fkey(id, body, created_at, vote_count, parent_id, user:profiles!answers_user_id_fkey(${SUMMARY}))`;
const QUESTION_APP = "id, slug, name, tagline, category, owner_id, link_checked_at";
const QUESTION_SELECT = `${QUESTION_BASE},
  app:apps!inner(${QUESTION_APP})`;
// (The app's question screens don't show Drop posters, so none are loaded.)

// Best first, then votes, then oldest; replies right under their answer.
function orderAnswers(answers: Answer[], bestId: string | null): Answer[] {
  const top = answers
    .filter((a) => !a.parent_id)
    .sort((a, b) => Number(b.id === bestId) - Number(a.id === bestId) || b.vote_count - a.vote_count || a.created_at.localeCompare(b.created_at));
  const replies = answers.filter((a) => a.parent_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return top.flatMap((a) => [a, ...replies.filter((r) => r.parent_id === a.id)]);
}

type QaState = { picks: Map<string, number>; votedQ: Set<string>; votedA: Set<string> };

const NO_QA_STATE: QaState = { picks: new Map(), votedQ: new Set(), votedA: new Set() };

function toQuestionCard(row: any, state: QaState): QuestionCard {
  const answers = ((row.answers ?? []) as any[]).map((a) => ({
    id: a.id,
    body: a.body,
    created_at: a.created_at,
    vote_count: a.vote_count,
    voted: state.votedA.has(a.id),
    parent_id: a.parent_id ?? null,
    user: toSummary(a.user),
  }));
  return {
    id: row.id,
    body: row.body,
    created_at: row.created_at,
    vote_count: row.vote_count,
    voted: state.votedQ.has(row.id),
    best_answer_id: row.best_answer_id,
    user: toSummary(row.user),
    poll: row.poll_options ? { options: row.poll_options, counts: row.poll_counts ?? [], mine: state.picks.get(row.id) ?? null } : null,
    answers: orderAnswers(answers, row.best_answer_id),
    answer_count: row.answer_count ?? answers.length,
    by_builder: row.user_id === row.app.owner_id,
    app: {
      id: row.app.id,
      slug: row.app.slug,
      name: row.app.name,
      tagline: row.app.tagline,
      category: row.app.category,
      owner_id: row.app.owner_id,
      poster_url: null,
    },
  };
}

function demoQuestionCards(): QuestionCard[] {
  const at = (hours: number) => new Date(Date.parse(demoCommentDate(0)) - hours * 3_600_000).toISOString();
  return Object.entries(demoQuestions).flatMap(([appId, list]) => {
    const app = demoApps.find((a) => a.id === appId)!;
    return list.map((q, qi) => {
      const hours = q.hours ?? 24 * (2 - qi);
      const answers: Answer[] = q.answers.map((a, ai) => ({
        id: `demo-a-${appId}-${qi}-${ai}`,
        body: a.body,
        created_at: at(hours - (ai + 1) * 0.5),
        vote_count: a.votes,
        voted: false,
        parent_id: null,
        user: toSummary(demoProfile(a.user)),
      }));
      q.answers.forEach((a, ai) => {
        if (a.replyTo !== undefined) answers[ai].parent_id = answers[a.replyTo].id;
      });
      const best = q.answers.findIndex((a) => a.best);
      const bestId = best >= 0 ? answers[best].id : null;
      return {
        id: `demo-q-${appId}-${qi}`,
        body: q.body,
        created_at: at(hours),
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

// What this person has picked and upvoted. Answer votes only for a thread
// (withAnswers), where answers show their buttons.
async function viewerQaState(viewerId: string | null, rows: any[], withAnswers = false): Promise<QaState> {
  const state: QaState = { picks: new Map(), votedQ: new Set(), votedA: new Set() };
  if (!supabase || !viewerId || rows.length === 0) return state;
  const pollIds = rows.filter((r) => r.poll_options).map((r) => r.id);
  const answerIds = withAnswers ? rows.flatMap((r) => ((r.answers ?? []) as { id: string }[]).map((a) => a.id)) : [];
  const [pv, qv, av] = await Promise.all([
    pollIds.length ? supabase.from("poll_votes").select("question_id, choice").eq("user_id", viewerId).in("question_id", pollIds) : Promise.resolve({ data: [] }),
    supabase.from("question_votes").select("question_id").eq("user_id", viewerId).in("question_id", rows.map((r) => r.id)),
    answerIds.length ? supabase.from("answer_votes").select("answer_id").eq("user_id", viewerId).in("answer_id", answerIds) : Promise.resolve({ data: [] }),
  ]);
  for (const v of (pv.data ?? []) as any[]) state.picks.set(v.question_id, v.choice);
  for (const v of (qv.data ?? []) as any[]) state.votedQ.add(v.question_id);
  for (const v of (av.data ?? []) as any[]) state.votedA.add(v.answer_id);
  return state;
}

// Same ranking as the website's Questions tab.
export async function getQuestionFeed(viewerId: string | null, interests: Interests = {}): Promise<QuestionCard[]> {
  if (!supabase) return rankQuestions(demoQuestionCards(), { interests });
  const [{ data, error }, learned] = await Promise.all([
    supabase
      .from("questions")
      .select(QUESTION_SELECT)
      .not("app.link_checked_at", "is", null)
      .order("created_at", { ascending: false })
      .limit(100)
      // The card previews one answer, so the top 10 by votes is plenty.
      .order("vote_count", { referencedTable: "answers", ascending: false })
      .limit(10, { referencedTable: "answers" }),
    viewerId ? viewerInterests(viewerId) : Promise.resolve({}),
  ]);
  if (error) throw new Error("Couldn't load questions.");
  const rows = (data ?? []) as any[];
  // Rank first, then load this person's votes for the 30 that make the page.
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  const page = rankQuestions(
    rows.map((r) => toQuestionCard(r, NO_QA_STATE)),
    { interests: mergeInterests(interests, learned), viewerId },
  )
    .slice(0, 30)
    .map((q) => byId.get(q.id));
  const state = await viewerQaState(viewerId, page);
  return page.map((r) => toQuestionCard(r, state));
}

// An app's questions for its page, most upvoted first.
export async function getAppQuestions(appId: string, viewerId: string | null): Promise<QuestionCard[]> {
  if (!supabase) return demoQuestionCards().filter((q) => q.app.id === appId);
  const { data } = await supabase
    .from("questions")
    .select(QUESTION_SELECT)
    .eq("app_id", appId)
    .order("vote_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);
  const rows = (data ?? []) as any[];
  const state = await viewerQaState(viewerId, rows);
  return rows.map((r) => toQuestionCard(r, state));
}

// Your live apps, for picking which one a question is about.
export async function getMyApps(viewerId: string | null): Promise<{ id: string; name: string }[]> {
  if (!supabase) return demoApps.slice(0, 2).map((a) => ({ id: a.id, name: a.name }));
  if (!viewerId) return [];
  const { data } = await supabase
    .from("apps")
    .select("id, name")
    .eq("owner_id", viewerId)
    .not("link_checked_at", "is", null)
    .order("created_at", { ascending: false });
  return (data ?? []) as { id: string; name: string }[];
}

export async function getQuestion(id: string, viewerId: string | null): Promise<QuestionCard | null> {
  if (!supabase) return demoQuestionCards().find((q) => q.id === id) ?? null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const joined = await supabase.from("questions").select(QUESTION_SELECT).eq("id", id).not("app.link_checked_at", "is", null).maybeSingle();
  if (joined.error) console.warn("Couldn't load the question", joined.error.message);
  let data = joined.data as any;
  if (!data) {
    // Read the question and its app separately, so a problem with the
    // combined read never turns a real question into "not found".
    const { data: q } = await supabase.from("questions").select(QUESTION_BASE).eq("id", id).maybeSingle();
    if (!q) return null;
    const { data: app } = await supabase.from("apps").select(QUESTION_APP).eq("id", (q as any).app_id).maybeSingle();
    if (!app?.link_checked_at) return null;
    data = { ...(q as any), app };
  }
  return toQuestionCard(data, await viewerQaState(viewerId, [data], true));
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

async function signedIn(): Promise<Result<{ id: string; token: string }>> {
  if (!supabase) return fail(DEMO_MESSAGE);
  const { data } = await supabase.auth.getSession();
  return data.session ? ok({ id: data.session.user.id, token: data.session.access_token }) : fail("Sign in first.");
}

export async function setLike(dropId: string, liked: boolean): Promise<Result> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const { error } = liked
    ? await supabase!.from("likes").insert({ user_id: auth.data.id, drop_id: dropId })
    : await supabase!.from("likes").delete().eq("user_id", auth.data.id).eq("drop_id", dropId);
  return error && error.code !== "23505" ? fail(dbMessage(error, "Couldn't save your like.")) : ok(undefined);
}

// Who follows someone, or who they follow (newest first), with which of
// those people you follow. Same as the website's /u/<name>/followers.
export type FollowList = { owner: ProfileSummary; people: ProfileSummary[]; youFollow: Set<string>; total: number };

export async function getFollowList(username: string, kind: "followers" | "following", viewerId: string | null): Promise<FollowList | null> {
  if (!supabase) {
    const owner = demoProfiles.find((p) => p.username === username);
    if (!owner) return null;
    const people = demoProfiles.filter((p) => p.id !== owner.id).map(toSummary);
    return { owner: toSummary(owner), people, youFollow: new Set(), total: people.length };
  }
  const { data: owner } = await supabase.from("profiles").select(SUMMARY).eq("username", username).maybeSingle();
  if (!owner) return null;
  const [mine, theirs] = kind === "followers" ? (["following_id", "follower_id"] as const) : (["follower_id", "following_id"] as const);
  const { data: rows, count } = await supabase
    .from("follows")
    .select(`created_at, person:profiles!follows_${theirs}_fkey(${SUMMARY})`, { count: "exact" })
    .eq(mine, (owner as { id: string }).id)
    .order("created_at", { ascending: false })
    .limit(200);
  const people = ((rows ?? []) as any[]).map((r) => r.person).filter(Boolean).map(toSummary);
  const youFollow = new Set<string>();
  if (viewerId && people.length > 0) {
    const { data: mineRows } = await supabase.from("follows").select("following_id").eq("follower_id", viewerId).in("following_id", people.map((p) => p.id));
    for (const r of mineRows ?? []) youFollow.add(r.following_id as string);
  }
  return { owner: toSummary(owner), people, youFollow, total: count ?? people.length };
}

export async function setFollow(profileId: string, follow: boolean): Promise<Result> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const { error } = follow
    ? await supabase!.from("follows").insert({ follower_id: auth.data.id, following_id: profileId })
    : await supabase!.from("follows").delete().eq("follower_id", auth.data.id).eq("following_id", profileId);
  return error && error.code !== "23505" ? fail(friendly(error.message, "Couldn't update that.")) : ok(undefined);
}

// The asker or the app's builder picks the best answer (a top-level one,
// not a reply): +5 reputation to whoever wrote it. Picking another moves it.
export async function markBestAnswer(questionId: string, answerId: string): Promise<Result> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const { error } = await supabase!.rpc("mark_best_answer", { p_question: questionId, p_answer: answerId });
  return error ? fail(error.code === "P0001" ? error.message : "Couldn't mark the best answer.") : ok(undefined);
}

// Upvote (or take back) a question or an answer. Not your own: the database
// refuses those.
export async function setQaVote(kind: "question" | "answer", id: string, on: boolean): Promise<Result> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const table = kind === "question" ? "question_votes" : "answer_votes";
  const column = kind === "question" ? "question_id" : "answer_id";
  const { error } = on
    ? await supabase!.from(table).insert({ user_id: auth.data.id, [column]: id })
    : await supabase!.from(table).delete().eq("user_id", auth.data.id).eq(column, id);
  if (error?.code === "42501") return fail("You can't vote on your own post.");
  return error && error.code !== "23505" ? fail("Couldn't save your vote.") : ok(undefined);
}

// Ask about an app, optionally with a one-tap poll (2-4 choices). Returns
// the new question's id.
export async function askQuestion(appId: string, body: string, pollOptions: string[] | null = null): Promise<Result<string>> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const text = body.trim();
  if (text.length < 5) return fail("Ask a bit more (at least 5 characters).");
  if (text.length > 500) return fail("Questions can be up to 500 characters.");
  const options = pollOptions?.map((o) => o.trim()).filter(Boolean) ?? [];
  if (pollOptions && (options.length < 2 || options.length > 4)) return fail("A poll needs 2 to 4 choices.");
  if (options.some((o) => o.length > 60)) return fail("Keep each choice under 60 characters.");
  const { data, error } = await supabase!
    .from("questions")
    .insert({ app_id: appId, user_id: auth.data.id, body: text, ...(options.length ? { poll_options: options } : {}) })
    .select("id")
    .single();
  return error ? fail(dbMessage(error, "Couldn't post your question.")) : ok((data as { id: string }).id);
}

// Pick a poll choice (0-based), change it, or null to take it back.
export async function votePoll(questionId: string, choice: number | null): Promise<Result<number[]>> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const { data, error } = await supabase!.rpc("vote_poll", { p_question: questionId, p_choice: choice });
  return error ? fail(error.code === "P0001" ? error.message : "Couldn't save your vote.") : ok(data as number[]);
}

// Answer a question, or with parentId, reply to an answer on it.
export async function answerQuestion(questionId: string, body: string, parentId: string | null = null): Promise<Result> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const text = body.trim();
  if (!text) return fail("Write an answer first.");
  if (text.length > 1000) return fail("Answers can be up to 1,000 characters.");
  const { error } = await supabase!
    .from("answers")
    .insert({ question_id: questionId, user_id: auth.data.id, body: text, ...(parentId ? { parent_id: parentId } : {}) });
  return error ? fail(dbMessage(error, "Couldn't post your answer.")) : ok(undefined);
}

// First sign-in (the Set up your profile screen): is this username free, and take it.
export async function checkUsername(value: string, viewerId: string): Promise<Result> {
  const username = value.trim().toLowerCase();
  if (!USERNAME_PATTERN.test(username)) return fail(`Usernames are ${USERNAME_HINT}`);
  if (username === OFFICIAL_HANDLE || isDefaultUsername(username)) return fail("That username is reserved.");
  if (!supabase) return ok(undefined);
  const { data, error } = await supabase.from("profiles").select("id").eq("username", username).maybeSingle();
  if (error) return fail("Couldn't check that name. Try again.");
  return data && (data as { id: string }).id !== viewerId ? fail("That username is taken.") : ok(undefined);
}

export async function claimUsername(value: string, displayName: string): Promise<Result> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const check = await checkUsername(value, auth.data.id);
  if (!check.ok) return check;
  const { error } = await supabase!
    .from("profiles")
    .update({ username: value.trim().toLowerCase(), display_name: displayName.trim().slice(0, 60) })
    .eq("id", auth.data.id);
  if (error?.code === "23505") return fail("That username was just taken. Try another.");
  return error ? fail(dbMessage(error, "Couldn't save your profile.")) : ok(undefined);
}

// Your status (and other role tags), shown as a badge by your photo.
// Your name, bio and skills (Me tab), with the same limits as the website's
// Edit profile. Website, LinkedIn and socials stay on the website.
export type About = { display_name: string; bio: string; skills: string[] };

export async function getMyAbout(): Promise<Result<About>> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const { data, error } = await supabase!.from("profiles").select("display_name, bio, skills").eq("id", auth.data.id).maybeSingle();
  if (error || !data) return fail("Couldn't load your profile.");
  return ok({ display_name: data.display_name ?? "", bio: data.bio ?? "", skills: (data.skills as string[] | null) ?? [] });
}

export async function saveAbout(input: { display_name: string; bio: string; skills: string }): Promise<Result> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const { error } = await supabase!
    .from("profiles")
    .update({ display_name: input.display_name.trim().slice(0, 60), bio: input.bio.trim().slice(0, 280), skills: parseList(input.skills, 20) })
    .eq("id", auth.data.id);
  return error ? fail("Couldn't save your profile.") : ok(undefined);
}

export async function setRoles(roles: string[]): Promise<Result> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const clean = roles.filter((r) => isOneOf(ROLES, r));
  const { error } = await supabase!.from("profiles").update({ roles: clean }).eq("id", auth.data.id);
  return error ? fail("Couldn't save your status.") : ok(undefined);
}

// A new profile photo (a square) or header picture (a wide 3:1 strip, shown
// only on your profile page): cropped and shrunk on the phone to a small
// JPEG, uploaded into your own folder, then set on your profile. The old one
// is deleted. Pass null to remove it.
export const setPhoto = (imageUri: string | null) => setProfileImage("avatar", imageUri);
export const setCover = (imageUri: string | null) => setProfileImage("cover", imageUri);

// Your current header picture (null if none, or before the website's
// database has the column).
export async function getMyCover(): Promise<string | null> {
  const auth = await signedIn();
  if (!auth.ok) return null;
  const { data } = await supabase!.from("profiles").select("cover_path").eq("id", auth.data.id).maybeSingle();
  return fileUrl((data as { cover_path?: string | null } | null)?.cover_path ?? null);
}

async function setProfileImage(kind: "avatar" | "cover", imageUri: string | null): Promise<Result<string | null>> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const id = auth.data.id;
  const column = kind === "avatar" ? "avatar_path" : "cover_path";
  const noun = kind === "avatar" ? "photo" : "header picture";
  const { data: before, error: readError } = await supabase!.from("profiles").select(column).eq("id", id).maybeSingle();
  if (readError) return fail(`Couldn't save your ${noun}. The website may need its latest database update.`);
  let path: string | null = null;
  if (imageUri) {
    path = `${id}/${kind}-${Date.now()}.jpg`;
    const up = await uploadImage(imageUri, path, kind === "avatar" ? [320, 320] : [1500, 500], auth.data.token);
    if (up !== "ok") return fail(up === "read" ? `Couldn't use that ${noun}. Try another one.` : `Your ${noun} didn't upload. Try again.`);
  }
  const { error } = await supabase!.from("profiles").update({ [column]: path }).eq("id", id);
  if (error) {
    if (path) await supabase!.storage.from(DROPS_BUCKET).remove([path]);
    return fail(`Couldn't save your ${noun}.`);
  }
  const old = (before as Record<string, string | null> | null)?.[column];
  if (old && old !== path) await supabase!.storage.from(DROPS_BUCKET).remove([old]);
  return ok(fileUrl(path));
}

// Crops and shrinks a picked picture, then uploads it to your folder.
async function uploadImage(uri: string, path: string, [width, height]: [number, number], token: string): Promise<"ok" | "read" | "upload"> {
  let jpeg: string;
  try {
    jpeg = await cropPhoto(uri, width, height);
  } catch {
    return "read";
  }
  try {
    if (Platform.OS === "web") {
      const blob = await (await fetch(jpeg)).blob();
      const { error } = await supabase!.storage.from(DROPS_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
      return error ? "upload" : "ok";
    }
    const upload = await new File(jpeg).upload(`${SUPABASE_URL}/storage/v1/object/${DROPS_BUCKET}/${path}`, {
      httpMethod: "POST",
      uploadType: UploadType.BINARY_CONTENT,
      mimeType: "image/jpeg",
      headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_KEY, "Content-Type": "image/jpeg", "x-upsert": "false" },
    });
    return upload.status >= 300 ? "upload" : "ok";
  } catch {
    return "upload";
  }
}

// Centered crop to the target shape, shrunk, JPEG: small enough to upload
// quickly anywhere.
async function cropPhoto(uri: string, width: number, height: number): Promise<string> {
  const first = await ImageManipulator.manipulate(uri).renderAsync();
  const scale = Math.min(first.width / width, first.height / height);
  const w = width * scale;
  const h = height * scale;
  const context = ImageManipulator.manipulate(uri)
    .crop({ originX: (first.width - w) / 2, originY: (first.height - h) / 2, width: w, height: h })
    .resize({ width, height });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.86 });
  return saved.uri;
}

// "Try it": counts the try (from the app, and for a sponsor card, the
// sponsored try), then returns where to send the person.
export async function recordTry(appSlug: string, sponsorshipId?: string): Promise<Result<string>> {
  if (!supabase) {
    const app = demoApps.find((a) => a.slug === appSlug);
    return app ? ok(app.url) : fail("Unknown app.");
  }
  const { data: app } = await supabase.from("apps").select("id, url").eq("slug", appSlug).not("link_checked_at", "is", null).maybeSingle();
  if (!app) return fail("That app isn't available.");
  const { data } = await supabase.auth.getSession();
  const uid = data.session?.user.id ?? null;
  await supabase.from("try_clicks").insert({ app_id: app.id, user_id: uid, source: sponsorshipId ? "sponsor" : "app" });
  if (uid && sponsorshipId) await supabase.rpc("record_sponsored_try", { p_id: sponsorshipId, p_app: app.id });
  return ok(app.url as string);
}

export async function recordBrandVisit(brandSlug: string, sponsorshipId: string): Promise<Result<string>> {
  if (!supabase) {
    const brand = demoBrands.find((b) => b.slug === brandSlug);
    return brand ? ok(brand.url) : fail("Unknown brand.");
  }
  const { data: brand } = await supabase.from("brands").select("id, url").eq("slug", brandSlug).not("link_checked_at", "is", null).maybeSingle();
  if (!brand) return fail("That brand isn't available.");
  const { data } = await supabase.auth.getSession();
  if (data.session) await supabase.rpc("record_sponsored_try", { p_id: sponsorshipId, p_app: brand.id });
  return ok(brand.url as string);
}

export type SitePreview = { name: string; tagline: string; description: string; category: string | null };

async function callSite<T>(path: string, token: string, body: unknown): Promise<Result<T>> {
  if (!SITE_URL) return fail("The app is missing EXPO_PUBLIC_SITE_URL, so it can't reach the website.");
  try {
    const res = await fetch(`${SITE_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
    return res.ok ? ok(json) : fail(json.error ?? "Something went wrong. Try again.");
  } catch {
    return fail("Couldn't reach Method V. Check your connection.");
  }
}

// Remove a question (with its answers) or an answer: your own, or anything in
// your app's Q&A. The website does it (removing other people's posts needs
// Method V's secret key); same rules as its Remove button.
export async function removePost(kind: "question" | "answer", id: string): Promise<Result> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const r = await callSite<{ removed: boolean }>("/api/mobile/remove-post", auth.data.token, { kind, id });
  return r.ok ? ok(undefined) : r;
}

// Reads the app's website to fill in name, tagline and category.
export async function previewLink(url: string): Promise<Result<SitePreview>> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const r = await callSite<{ preview: SitePreview }>("/api/mobile/preview", auth.data.token, { url });
  return r.ok ? ok(r.data.preview) : r;
}

export type NewDrop = {
  videoUri: string;
  mimeType: string;
  durationSeconds: number;
  url: string;
  name: string;
  tagline: string;
  category: string;
  caption: string;
  // The builder ticked the safety box on the Post screen.
  safetyChecked: boolean;
  // Optional cover image for the app's card (Browse, Featured).
  coverUri?: string | null;
};

// Uploads the video straight to storage (into your own folder, streamed from
// disk), then asks the website to check the link and publish the app.
// A promotion that's running right now (public.promotions), or null.
export async function getPromotion(slug: string): Promise<Promotion | null> {
  if (!supabase) return slug === "drop_bonus" ? { slug, amount: 10, ends_at: "2026-11-01T06:59:59Z", per_day: 3 } : null;
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("promotions")
    .select("slug, amount, ends_at, per_day")
    .eq("slug", slug)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .maybeSingle();
  return error ? null : ((data as Promotion | null) ?? null);
}

export async function postDrop(input: NewDrop, onProgress?: (fraction: number) => void): Promise<Result<{ slug: string }>> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const ext = input.mimeType === "video/quicktime" ? "mov" : input.mimeType === "video/webm" ? "webm" : "mp4";
  const path = `${auth.data.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  try {
    const upload = await new File(input.videoUri).upload(`${SUPABASE_URL}/storage/v1/object/${DROPS_BUCKET}/${path}`, {
      httpMethod: "POST",
      uploadType: UploadType.BINARY_CONTENT,
      mimeType: input.mimeType,
      headers: { Authorization: `Bearer ${auth.data.token}`, apikey: SUPABASE_KEY, "Content-Type": input.mimeType, "x-upsert": "false" },
      onProgress: ({ bytesSent, totalBytes }) => onProgress?.(totalBytes ? bytesSent / totalBytes : 0),
    });
    if (upload.status >= 300) return fail("The video didn't upload. Try again, or pick a smaller file.");
  } catch {
    return fail("The video didn't upload. Check your connection and try again.");
  }
  // The optional cover image, cropped to 16:9.
  let coverPath: string | null = null;
  if (input.coverUri) {
    coverPath = `${auth.data.id}/appcover-${Date.now()}.jpg`;
    const up = await uploadImage(input.coverUri, coverPath, [1280, 720], auth.data.token);
    if (up !== "ok") {
      await supabase!.storage.from(DROPS_BUCKET).remove([path]);
      return fail(up === "read" ? "Couldn't use that cover image. Try another one." : "The cover image didn't upload. Try again.");
    }
  }
  const r = await callSite<{ slug: string }>("/api/mobile/apps", auth.data.token, {
    videoPath: path,
    durationSeconds: input.durationSeconds,
    url: input.url,
    name: input.name,
    tagline: input.tagline,
    category: input.category,
    caption: input.caption,
    safetyChecked: input.safetyChecked,
    coverPath,
  });
  if (!r.ok) {
    // Don't leave an orphaned video (or cover) behind.
    await supabase!.storage.from(DROPS_BUCKET).remove(coverPath ? [path, coverPath] : [path]);
    return fail(friendly(r.error, "Couldn't post your Drop."));
  }
  return ok({ slug: r.data.slug });
}
