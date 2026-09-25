// Everything the app reads and writes. Talks to Supabase directly as the
// signed-in person (row level security applies, exactly as on the website),
// and to the website only for posting, which needs the server's link check.
// In demo mode it returns the website's own sample data.

import { File, UploadType } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Platform } from "react-native";

import { CATEGORIES, ROLES, isOneOf } from "@shared/constants";
import {
  demoApps,
  demoBrands,
  demoCommentDate,
  demoComments,
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
  Comment,
  Drop,
  FeedItem,
  Profile,
  ProfileSummary,
  QuestionCard,
  SponsorCard,
  Suggestion,
  TopBuilder,
  TopTester,
} from "@shared/types";

import { SIGNALS, bumpInterest, mergeInterests, rankFeed, rankQuestions, type Interests } from "@shared/interests";
import { SUGGESTION_LIMIT, topUpSuggestions } from "@shared/suggest";

import { DEMO_MESSAGE, DROPS_BUCKET, SITE_URL, SUPABASE_KEY, SUPABASE_URL, fileUrl } from "./config";
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
    backer_count: row.backer_count ?? 0,
    created_at: row.created_at,
  };
}

function toCard(row: any): AppCard {
  const latest = [...(row.drops ?? [])].sort((a: any, b: any) => b.created_at.localeCompare(a.created_at))[0];
  return { ...toApp(row), owner: toSummary(row.owner), poster_url: fileUrl(latest?.poster_path) };
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
): Promise<{ featured: AppCard[]; suggestions: Suggestion[]; newest: AppCard[]; builders: TopBuilder[]; testers: TopTester[] }> {
  if (!supabase) {
    const cards = demoCards();
    return {
      ...demoLeaderboards(),
      featured: demoFeaturedIds.map((id) => cards.find((c) => c.id === id)!).filter(Boolean),
      newest: [...cards].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 10),
      suggestions: [
        { ...toSummary(demoProfile("demo-june")), shared_categories: ["design"], shared_skills: ["React"] },
        { ...toSummary(demoProfile("demo-marco")), shared_categories: ["education", "productivity"], shared_skills: [] },
      ],
    };
  }
  const now = new Date().toISOString();
  const [featured, suggested, newest] = await Promise.all([
    supabase
      .from("apps")
      .select(CARD_SELECT)
      .not("link_checked_at", "is", null)
      .or(`featured_until.gt.${now},boosted_until.gt.${now}`)
      .limit(10),
    viewerId ? supabase.rpc("suggest_builders", { p_limit: SUGGESTION_LIMIT }) : Promise.resolve({ data: [] }),
    supabase.from("apps").select(CARD_SELECT).not("link_checked_at", "is", null).order("created_at", { ascending: false }).limit(10),
  ]);
  // A Spotlight booked for later (waiting in line) isn't on yet.
  const at = (t: string | null) => (t ? new Date(t).getTime() : 0);
  const onNow = (r: any) => at(r.featured_until) > Date.now() || !r.boosted_from || at(r.boosted_from) <= Date.now();
  let top = (featured.data ?? []).filter(onNow).map(toCard);
  if (top.length === 0) {
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    const { data } = await supabase
      .from("apps")
      .select(CARD_SELECT)
      .not("link_checked_at", "is", null)
      .gt("created_at", since)
      .order("try_count", { ascending: false })
      .limit(6);
    top = (data ?? []).map(toCard);
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
    const newestPeople = ((fresh ?? []) as any[]).map((r) => ({ ...toSummary(r), shared_categories: [], shared_skills: [] }));
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

export async function getAppDetail(slug: string, viewerId: string | null): Promise<{ app: AppDetail; comments: Comment[] } | null> {
  if (!supabase) {
    const found = demoApps.find((a) => a.slug === slug);
    if (!found) return null;
    const drop = demoDrops.find((d) => d.app_id === found.id) ?? null;
    const comments = drop
      ? (demoComments[drop.id] ?? []).map((c, i) => ({ id: `${drop.id}-${i}`, body: c.body, created_at: demoCommentDate(c.days), user: toSummary(demoProfile(c.user)) }))
      : [];
    return { app: { ...found, owner: toSummary(demoProfile(found.owner_id)), drop, liked: false, sponsor: demoSponsor(found.id) }, comments };
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
  const [liked, sponsors, comments] = await Promise.all([
    drop ? likedIds(viewerId, [drop.id]) : Promise.resolve(new Set<string>()),
    sponsorCards([row.id]),
    drop
      ? supabase
          .from("comments")
          .select(`id, body, created_at, user:profiles!comments_user_id_fkey(${SUMMARY})`)
          .eq("drop_id", drop.id)
          .order("created_at", { ascending: true })
          .limit(100)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  return {
    app: { ...toApp(row), owner: toSummary(row.owner), drop, liked: drop ? liked.has(drop.id) : false, sponsor: sponsors.get(row.id) ?? null },
    comments: ((comments.data ?? []) as any[]).map((c) => ({ id: c.id, body: c.body, created_at: c.created_at, user: toSummary(c.user) })),
  };
}

export async function getProfileBundle(
  username: string,
  viewerId: string | null,
): Promise<{ profile: Profile; apps: AppCard[]; following: boolean } | null> {
  if (!supabase) {
    const profile = demoProfiles.find((p) => p.username === username);
    if (!profile) return null;
    return { profile, apps: demoCards().filter((a) => a.owner_id === profile.id), following: false };
  }
  const { data: profile } = await supabase.from("profiles").select("*").eq("username", username).maybeSingle();
  if (!profile) return null;
  const [apps, follow] = await Promise.all([
    supabase.from("apps").select(CARD_SELECT).eq("owner_id", profile.id).not("link_checked_at", "is", null).order("created_at", { ascending: false }),
    viewerId && viewerId !== profile.id
      ? supabase.from("follows").select("follower_id").eq("follower_id", viewerId).eq("following_id", profile.id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return { profile: profile as Profile, apps: (apps.data ?? []).map(toCard), following: Boolean(follow.data) };
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

const QUESTION_SELECT = `id, body, created_at, vote_count, answer_count, best_answer_id, user_id, poll_options, poll_counts,
  user:profiles!questions_user_id_fkey(${SUMMARY}),
  answers(id, body, created_at, vote_count, parent_id, user:profiles!answers_user_id_fkey(${SUMMARY})),
  app:apps!inner(id, slug, name, tagline, category, owner_id, link_checked_at)`;
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
  const { data } = await supabase.from("questions").select(QUESTION_SELECT).eq("id", id).not("app.link_checked_at", "is", null).maybeSingle();
  if (!data) return null;
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
  return error && error.code !== "23505" ? fail("Couldn't save your like.") : ok(undefined);
}

export async function addComment(dropId: string, body: string): Promise<Result> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const text = body.trim();
  if (!text) return fail("Write something first.");
  if (text.length > 500) return fail("Comments can be up to 500 characters.");
  const { error } = await supabase!.from("comments").insert({ drop_id: dropId, user_id: auth.data.id, body: text });
  return error ? fail("Couldn't post your comment.") : ok(undefined);
}

export async function setFollow(profileId: string, follow: boolean): Promise<Result> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const { error } = follow
    ? await supabase!.from("follows").insert({ follower_id: auth.data.id, following_id: profileId })
    : await supabase!.from("follows").delete().eq("follower_id", auth.data.id).eq("following_id", profileId);
  return error && error.code !== "23505" ? fail("Couldn't update that.") : ok(undefined);
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
  return error ? fail("Couldn't post your question.") : ok((data as { id: string }).id);
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
  return error ? fail("Couldn't post your answer.") : ok(undefined);
}

// Your status (and other role tags), shown as a badge by your photo.
export async function setRoles(roles: string[]): Promise<Result> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const clean = roles.filter((r) => isOneOf(ROLES, r));
  const { error } = await supabase!.from("profiles").update({ roles: clean }).eq("id", auth.data.id);
  return error ? fail("Couldn't save your status.") : ok(undefined);
}

// A new profile photo: squared and shrunk on the phone to a small JPEG,
// uploaded into your own folder, then set on your profile. The old one is
// deleted. Pass null to go back to the letter avatar.
export async function setPhoto(imageUri: string | null): Promise<Result<string | null>> {
  const auth = await signedIn();
  if (!auth.ok) return auth;
  const id = auth.data.id;
  const { data: before } = await supabase!.from("profiles").select("avatar_path").eq("id", id).maybeSingle();
  let path: string | null = null;
  if (imageUri) {
    path = `${id}/avatar-${Date.now()}.jpg`;
    try {
      const jpeg = await squarePhoto(imageUri);
      if (Platform.OS === "web") {
        const blob = await (await fetch(jpeg)).blob();
        const { error } = await supabase!.storage.from(DROPS_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
        if (error) return fail("Your photo didn't upload. Try again.");
      } else {
        const upload = await new File(jpeg).upload(`${SUPABASE_URL}/storage/v1/object/${DROPS_BUCKET}/${path}`, {
          httpMethod: "POST",
          uploadType: UploadType.BINARY_CONTENT,
          mimeType: "image/jpeg",
          headers: { Authorization: `Bearer ${auth.data.token}`, apikey: SUPABASE_KEY, "Content-Type": "image/jpeg", "x-upsert": "false" },
        });
        if (upload.status >= 300) return fail("Your photo didn't upload. Try again.");
      }
    } catch {
      return fail("Couldn't use that photo. Try another one.");
    }
  }
  const { error } = await supabase!.from("profiles").update({ avatar_path: path }).eq("id", id);
  if (error) {
    if (path) await supabase!.storage.from(DROPS_BUCKET).remove([path]);
    return fail("Couldn't save your photo.");
  }
  const old = (before as { avatar_path?: string | null } | null)?.avatar_path;
  if (old && old !== path) await supabase!.storage.from(DROPS_BUCKET).remove([old]);
  return ok(fileUrl(path));
}

// Centered square, 320px, JPEG: small enough to upload quickly anywhere.
async function squarePhoto(uri: string): Promise<string> {
  const first = await ImageManipulator.manipulate(uri).renderAsync();
  const side = Math.min(first.width, first.height);
  const context = ImageManipulator.manipulate(uri)
    .crop({ originX: (first.width - side) / 2, originY: (first.height - side) / 2, width: side, height: side })
    .resize({ width: 320, height: 320 });
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
};

// Uploads the video straight to storage (into your own folder, streamed from
// disk), then asks the website to check the link and publish the app.
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
  const r = await callSite<{ slug: string }>("/api/mobile/apps", auth.data.token, {
    videoPath: path,
    durationSeconds: input.durationSeconds,
    url: input.url,
    name: input.name,
    tagline: input.tagline,
    category: input.category,
    caption: input.caption,
  });
  if (!r.ok) {
    // Don't leave an orphaned video behind.
    await supabase!.storage.from(DROPS_BUCKET).remove([path]);
    return fail(friendly(r.error, "Couldn't post your Drop."));
  }
  return ok({ slug: r.data.slug });
}
