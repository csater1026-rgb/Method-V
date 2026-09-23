"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { CATEGORIES, MAX_DROP_SECONDS, PRICING, ROLES, STAGES, isOneOf } from "@/lib/constants";
import { getViewer } from "@/lib/data";
import { parseList, slugify } from "@/lib/format";
import { checkLink, parseAppUrl } from "@/lib/link-check";
import { DEMO_MODE_MESSAGE, isSupabaseConfigured } from "@/lib/supabase/env";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import type { ActionResult, Viewer } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGN_IN_FIRST = "Sign in first.";

type Signed = { viewer: Viewer } | { error: string };

async function requireViewer(): Promise<Signed> {
  if (!isSupabaseConfigured) return { error: DEMO_MODE_MESSAGE };
  const viewer = await getViewer();
  return viewer ? { viewer } : { error: SIGN_IN_FIRST };
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

// ---------------------------------------------------------------------------
// Sign in / out
// ---------------------------------------------------------------------------

export type SignInState = { status: "idle" } | { status: "sent"; email: string } | { status: "error"; error: string };

function safeNext(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}

async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signIn(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!isSupabaseConfigured) return { status: "error", error: DEMO_MODE_MESSAGE };
  const email = text(formData, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { status: "error", error: "Enter a valid email address." };
  }
  const next = safeNext(text(formData, "next"));
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { status: "error", error: error.message };
  return { status: "sent", email };
}

export async function signOut() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  revalidatePath("/", "layout");
  redirect("/");
}

// ---------------------------------------------------------------------------
// Likes, comments, follows
// ---------------------------------------------------------------------------

export async function setLike(dropId: string, liked: boolean): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(dropId)) return { ok: false, error: "Unknown Drop." };

  const supabase = await createClient();
  const { error } = liked
    ? await supabase.from("likes").insert({ user_id: auth.viewer.id, drop_id: dropId })
    : await supabase.from("likes").delete().eq("user_id", auth.viewer.id).eq("drop_id", dropId);
  // Liking twice (e.g. two tabs) is fine.
  if (error && error.code !== "23505") return { ok: false, error: "Couldn't save your like." };
  return { ok: true };
}

export async function addComment(dropId: string, appSlug: string, body: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(dropId)) return { ok: false, error: "Unknown Drop." };
  const trimmed = body.trim();
  if (!trimmed) return { ok: false, error: "Write something first." };
  if (trimmed.length > 500) return { ok: false, error: "Comments can be up to 500 characters." };

  const supabase = await createClient();
  const { error } = await supabase.from("comments").insert({ drop_id: dropId, user_id: auth.viewer.id, body: trimmed });
  if (error) return { ok: false, error: "Couldn't post your comment." };
  revalidatePath(`/apps/${appSlug}`);
  return { ok: true };
}

export async function deleteComment(commentId: string, appSlug: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(commentId)) return { ok: false, error: "Unknown comment." };
  const supabase = await createClient();
  const { error } = await supabase.from("comments").delete().eq("id", commentId).eq("user_id", auth.viewer.id);
  if (error) return { ok: false, error: "Couldn't delete that comment." };
  revalidatePath(`/apps/${appSlug}`);
  return { ok: true };
}

export async function setFollow(profileId: string, follow: boolean): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(profileId)) return { ok: false, error: "Unknown builder." };
  if (profileId === auth.viewer.id) return { ok: false, error: "You can't follow yourself." };

  const supabase = await createClient();
  const { error } = follow
    ? await supabase.from("follows").insert({ follower_id: auth.viewer.id, following_id: profileId })
    : await supabase.from("follows").delete().eq("follower_id", auth.viewer.id).eq("following_id", profileId);
  if (error && error.code !== "23505") return { ok: false, error: "Couldn't update follow." };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

export type ProfileState = { status: "idle" } | { status: "saved" } | { status: "error"; error: string };

function optionalHandle(value: string): string | null {
  const v = value.replace(/^@/, "").trim();
  return v ? v : null;
}

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const auth = await requireViewer();
  if ("error" in auth) return { status: "error", error: auth.error };

  const username = text(formData, "username").toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return { status: "error", error: "Usernames are 3–24 characters: lowercase letters, numbers and _." };
  }
  const roles = formData.getAll("roles").filter((r): r is string => isOneOf(ROLES, r));
  const website = text(formData, "website_url");
  if (website && !parseAppUrl(website)) return { status: "error", error: "Website must be a public http(s) link." };
  const linkedin = text(formData, "linkedin_url");
  if (linkedin && !/^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(linkedin)) {
    return { status: "error", error: "LinkedIn must be a https://linkedin.com/... link." };
  }
  const x = optionalHandle(text(formData, "x_handle"));
  if (x && !/^[A-Za-z0-9_]{1,15}$/.test(x)) return { status: "error", error: "That X handle doesn't look right." };
  const github = optionalHandle(text(formData, "github_handle"));
  if (github && !/^[A-Za-z0-9-]{1,39}$/.test(github)) {
    return { status: "error", error: "That GitHub username doesn't look right." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      display_name: text(formData, "display_name").slice(0, 60),
      bio: text(formData, "bio").slice(0, 280),
      roles,
      skills: parseList(text(formData, "skills"), 20),
      website_url: website || null,
      linkedin_url: linkedin || null,
      x_handle: x,
      github_handle: github,
    })
    .eq("id", auth.viewer.id);

  if (error) {
    if (error.code === "23505") return { status: "error", error: "That username is taken." };
    return { status: "error", error: "Couldn't save your profile." };
  }
  revalidatePath("/", "layout");
  return { status: "saved" };
}

// ---------------------------------------------------------------------------
// Posting an app with its Drop
// ---------------------------------------------------------------------------

export async function checkAppLink(url: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  const result = await checkLink(url);
  return result.ok ? { ok: true } : { ok: false, error: result.reason };
}

export type NewApp = {
  name: string;
  tagline: string;
  description: string;
  url: string;
  category: string;
  techStack: string;
  pricing: string;
  stage: string;
  caption: string;
  videoPath: string;
  posterPath: string | null;
  durationSeconds: number;
};

export async function createApp(input: NewApp): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { viewer } = auth;

  const name = input.name.trim();
  const tagline = input.tagline.trim();
  if (!name || name.length > 60) return { ok: false, error: "App name is required (up to 60 characters)." };
  if (!tagline || tagline.length > 120) return { ok: false, error: "Tagline is required (up to 120 characters)." };
  if (input.description.length > 2000) return { ok: false, error: "Description can be up to 2,000 characters." };
  if (input.caption.length > 300) return { ok: false, error: "Caption can be up to 300 characters." };
  if (!isOneOf(CATEGORIES, input.category)) return { ok: false, error: "Pick a category." };
  if (!isOneOf(PRICING, input.pricing)) return { ok: false, error: "Pick a pricing option." };
  if (!isOneOf(STAGES, input.stage)) return { ok: false, error: "Pick a stage." };
  const duration = Number(input.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DROP_SECONDS) {
    return { ok: false, error: `Drops can be up to ${MAX_DROP_SECONDS} seconds.` };
  }
  const ownFile = (p: string) => p.startsWith(`${viewer.id}/`) && !p.includes("..") && p.length < 200;
  if (!ownFile(input.videoPath) || (input.posterPath && !ownFile(input.posterPath))) {
    return { ok: false, error: "Upload the video again." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "The server is missing SUPABASE_SECRET_KEY, so it can't verify links yet." };
  }

  const link = await checkLink(input.url);
  if (!link.ok) return { ok: false, error: `Link check failed: ${link.reason}` };

  const supabase = await createClient();
  const base = slugify(name);
  let app: { id: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 5 && !app; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      .from("apps")
      .insert({
        owner_id: viewer.id,
        slug,
        name,
        tagline,
        description: input.description.trim(),
        url: input.url.trim(),
        category: input.category,
        tech_stack: parseList(input.techStack, 12),
        pricing: input.pricing,
        stage: input.stage,
      })
      .select("id, slug")
      .single();
    if (data) app = data;
    else if (error?.code !== "23505") return { ok: false, error: "Couldn't save your app." };
  }
  if (!app) return { ok: false, error: "Couldn't pick a link for your app. Try a slightly different name." };

  const { error: markError } = await admin
    .from("apps")
    .update({ link_checked_at: new Date().toISOString() })
    .eq("id", app.id);

  const { error: dropError } = markError
    ? { error: markError }
    : await supabase.from("drops").insert({
        app_id: app.id,
        owner_id: viewer.id,
        video_path: input.videoPath,
        poster_path: input.posterPath,
        duration_seconds: Math.round(duration * 100) / 100,
        caption: input.caption.trim(),
      });

  if (dropError) {
    await supabase.from("apps").delete().eq("id", app.id);
    return { ok: false, error: "Couldn't save your Drop." };
  }

  revalidatePath("/");
  revalidatePath("/browse");
  revalidatePath(`/u/${viewer.username}`);
  redirect(`/apps/${app.slug}?posted=1`);
}
