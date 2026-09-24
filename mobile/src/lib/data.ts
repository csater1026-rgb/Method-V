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
  demoSponsors,
} from "@shared/demo";
import type { App, AppCard, AppDetail, Comment, Drop, FeedItem, Profile, ProfileSummary, SponsorCard, Suggestion } from "@shared/types";

import { SIGNALS, bumpInterest, mergeInterests, rankFeed, type Interests } from "@shared/interests";

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

// Home: Featured (picked by the team, launching today, or boosted, else
// what's hot this month), builders to follow, then the newest projects.
// Everything else is on Browse.
export async function getHome(
  viewerId: string | null,
): Promise<{ featured: AppCard[]; suggestions: Suggestion[]; newest: AppCard[] }> {
  if (!supabase) {
    const cards = demoCards();
    return {
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
    viewerId ? supabase.rpc("suggest_builders", { p_limit: 8 }) : Promise.resolve({ data: [] }),
    supabase.from("apps").select(CARD_SELECT).not("link_checked_at", "is", null).order("created_at", { ascending: false }).limit(10),
  ]);
  let top = (featured.data ?? []).map(toCard);
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
  const suggestions = suggestedRows.map((r) => ({
    ...toSummary({ ...r, avatar_path: photos.get(r.id) ?? null }),
    shared_categories: r.shared_categories ?? [],
    shared_skills: r.shared_skills ?? [],
  }));
  return { featured: top, suggestions, newest: (newest.data ?? []).map(toCard) };
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
