"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  CONNECT_REASONS,
  CREDIT_PACKS,
  PACKAGE_RULES,
  EARN,
  MIN_PASSWORD,
  OFFICIAL_HANDLE,
  ROLES,
  TESTER_PACKS,
  WOULD_USE,
  isOneOf,
  packageFor,
} from "@/lib/constants";
import { getViewer } from "@/lib/data";
import { parseList, slugify } from "@/lib/format";
import { checkLink, fetchPage, parseAppUrl } from "@/lib/link-check";
import { publishApp, type NewApp } from "@/lib/publish";
import { settleRefunds } from "@/lib/payments";
import {
  PAYMENTS_OFF_MESSAGE,
  StripeError,
  createCheckout,
  createConnectAccount,
  createOnboardingLink,
  createTransfer,
  isStripeConfigured,
} from "@/lib/stripe";
import { sitePreview, type SitePreview } from "@/lib/site-preview";
import { SOCIALS, cleanHandle } from "@/lib/socials";
import { DEMO_MODE_MESSAGE, DROPS_BUCKET, authProviders, isSupabaseConfigured, type AuthProvider } from "@/lib/supabase/env";
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

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "confirm"; email: string }
  | { status: "error"; error: string };

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
  if (error) {
    console.error("sign-in email failed", error.message);
    return { status: "error", error: emailError(error.message) };
  }
  return { status: "sent", email };
}

// Supabase's errors when it can't send an email, in words people can act on.
function emailError(message: string): string {
  if (/rate limit|too many|seconds/i.test(message)) return "Too many emails asked for. Wait a minute, then try again.";
  if (/sending|smtp|email/i.test(message)) return "We couldn't send the email just now. Try again in a minute, or sign in with your password.";
  return message;
}

// Email + password: "signin" or "signup" (the form's mode field). New
// accounts confirm their email first when Supabase asks for it (the default).
export async function passwordAuth(_prev: SignInState, formData: FormData): Promise<SignInState> {
  if (!isSupabaseConfigured) return { status: "error", error: DEMO_MODE_MESSAGE };
  const email = text(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const mode = text(formData, "mode") === "signup" ? "signup" : "signin";
  const next = safeNext(text(formData, "next"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { status: "error", error: "Enter a valid email address." };
  }
  const supabase = await createClient();
  if (mode === "signin") {
    if (!password) return { status: "error", error: "Enter your password." };
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      return {
        status: "error",
        error: /confirm/i.test(error.message)
          ? "Confirm your email first: check your inbox for the link."
          : "That email and password don't match. Try again, or email yourself a sign-in link.",
      };
    }
  } else {
    if (password.length < MIN_PASSWORD) return { status: "error", error: `Use at least ${MIN_PASSWORD} characters for your password.` };
    if (password.length > 72) return { status: "error", error: "Keep your password under 72 characters." };
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (error) {
      if (/sending|smtp|rate limit/i.test(error.message)) {
        console.error("sign-up email failed", error.message);
        return { status: "error", error: emailError(error.message) };
      }
      return { status: "error", error: rpcError(error.message, "Couldn't create your account. Try again.") };
    }
    if (!data.session) return { status: "confirm", email };
  }
  revalidatePath("/", "layout");
  redirect(next);
}

export async function setPassword(password: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (password.length < MIN_PASSWORD) return { ok: false, error: `Use at least ${MIN_PASSWORD} characters.` };
  if (password.length > 72) return { ok: false, error: "Keep it under 72 characters." };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, error: rpcError(error.message, "Couldn't save your password.") };
  return { ok: true };
}

// "Continue with GitHub/Google": off to the provider, back via /auth/callback.
export async function signInWithProvider(formData: FormData) {
  const provider = text(formData, "provider") as AuthProvider;
  const next = safeNext(text(formData, "next"));
  if (!isSupabaseConfigured || !authProviders.includes(provider)) redirect(`/login?next=${encodeURIComponent(next)}`);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect(`/login?error=link&next=${encodeURIComponent(next)}`);
  redirect(data.url);
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

export async function updateProfile(_prev: ProfileState, formData: FormData): Promise<ProfileState> {
  const auth = await requireViewer();
  if ("error" in auth) return { status: "error", error: auth.error };

  const username = text(formData, "username").toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(username)) {
    return { status: "error", error: "Usernames are 3–24 characters: lowercase letters, numbers and _." };
  }
  if (username === OFFICIAL_HANDLE && auth.viewer.username !== OFFICIAL_HANDLE) {
    return { status: "error", error: "That username is reserved." };
  }
  const roles = formData.getAll("roles").filter((r): r is string => isOneOf(ROLES, r));
  const website = text(formData, "website_url");
  if (website && !parseAppUrl(website)) return { status: "error", error: "Website must be a public http(s) link." };
  const linkedin = text(formData, "linkedin_url");
  if (linkedin && !/^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(linkedin)) {
    return { status: "error", error: "LinkedIn must be a https://linkedin.com/... link." };
  }
  // Social handles: "@june", "june" or a pasted profile link all work.
  const handles: Record<string, string | null> = {};
  const newer: Record<string, string | null> = {};
  for (const s of SOCIALS) {
    const handle = cleanHandle(text(formData, s.column), s.key);
    if (handle && !s.pattern.test(handle)) return { status: "error", error: `That ${s.label} handle doesn't look right.` };
    (s.newer ? newer : handles)[s.column] = handle || null;
  }

  const base = {
    username,
    display_name: text(formData, "display_name").slice(0, 60),
    bio: text(formData, "bio").slice(0, 280),
    roles,
    skills: parseList(text(formData, "skills"), 20),
    website_url: website || null,
    linkedin_url: linkedin || null,
    ...handles,
  };
  const supabase = await createClient();
  let { error } = await supabase
    .from("profiles")
    .update({ ...base, ...newer })
    .eq("id", auth.viewer.id);
  // The newer networks need 20261002000000_socials.sql; without it, save the rest.
  if (error && (error.code === "PGRST204" || error.code === "42703")) {
    if (Object.values(newer).some(Boolean)) {
      return { status: "error", error: "Instagram, TikTok, YouTube and Threads need the latest database update. Open /api/health to see what to run." };
    }
    ({ error } = await supabase.from("profiles").update(base).eq("id", auth.viewer.id));
  }

  if (error) {
    if (error.code === "23505") return { status: "error", error: "That username is taken." };
    if (error.code === "P0001" && error.message === "That username is reserved.") return { status: "error", error: error.message };
    return { status: "error", error: "Couldn't save your profile." };
  }
  revalidatePath("/", "layout");
  return { status: "saved" };
}

// Saves (or with null, removes) the profile photo the browser just uploaded
// to drops/<your id>/avatar-<time>.jpg, and deletes the one it replaces.
export async function setAvatar(path: string | null): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  const id = auth.viewer.id;
  if (path !== null && !new RegExp(`^${id}/avatar-[0-9]+\\.jpg$`).test(path)) {
    return { ok: false, error: "That photo didn't upload properly. Try again." };
  }
  const supabase = await createClient();
  const { data: before, error: readError } = await supabase.from("profiles").select("avatar_path").eq("id", id).maybeSingle();
  if (readError) {
    return { ok: false, error: "Profile photos need the latest database update. Open /api/health to see what to run." };
  }
  const { error } = await supabase.from("profiles").update({ avatar_path: path }).eq("id", id);
  if (error) return { ok: false, error: "Couldn't save your photo." };
  const old = before?.avatar_path as string | null | undefined;
  if (old && old !== path) await supabase.storage.from(DROPS_BUCKET).remove([old]);
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Push notifications: which kinds, and this browser on or off
// ---------------------------------------------------------------------------

export async function saveNotificationSettings(settings: { follows: boolean; feedback: boolean; messages: boolean }): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  const row = {
    user_id: auth.viewer.id,
    follows: settings.follows === true,
    feedback: settings.feedback === true,
    messages: settings.messages === true,
  };
  const supabase = await createClient();
  const { error } = await supabase.from("notification_settings").upsert(row, { onConflict: "user_id" });
  if (error) return { ok: false, error: "Couldn't save your notification settings." };
  return { ok: true };
}

export async function registerWebPush(sub: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (typeof sub?.endpoint !== "string" || !sub.endpoint.startsWith("https://") || typeof sub.keys?.p256dh !== "string" || typeof sub.keys?.auth !== "string") {
    return { ok: false, error: "This browser didn't give a usable subscription." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_web_push", { p_endpoint: sub.endpoint, p_p256dh: sub.keys.p256dh, p_auth: sub.keys.auth });
  return error ? { ok: false, error: "Couldn't turn on notifications for this browser." } : { ok: true };
}

export async function unregisterWebPush(endpoint: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  const supabase = await createClient();
  const { error } = await supabase.rpc("unregister_web_push", { p_endpoint: String(endpoint) });
  return error ? { ok: false, error: "Couldn't turn off notifications for this browser." } : { ok: true };
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

// Reads the app's site to fill in the post: name, tagline, description and a
// best-guess category. Also confirms the link works.
export async function previewLink(url: string): Promise<{ ok: true; preview: SitePreview } | { ok: false; error: string }> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  const page = await fetchPage(url);
  if (!page.ok) return { ok: false, error: page.reason };
  return { ok: true, preview: sitePreview(page.html ?? "", page.finalUrl) };
}

export type { NewApp } from "@/lib/publish";

export async function createApp(input: NewApp): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  const { viewer } = auth;
  const result = await publishApp(await createClient(), viewer.id, input);
  if (!result.ok) return result;
  const app = { slug: result.slug };

  revalidatePath("/");
  revalidatePath("/browse");
  revalidatePath(`/u/${viewer.username}`);
  redirect(`/apps/${app.slug}?posted=1`);
}

// ---------------------------------------------------------------------------
// Phase 3: feedback and credits
// ---------------------------------------------------------------------------

export type NewFeedback = {
  wouldUse: string;
  rating: number;
  worked: string;
  confusing: string;
};

export async function submitFeedback(appId: string, appSlug: string, input: NewFeedback): Promise<ActionResult & { earned?: number }> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(appId)) return { ok: false, error: "Unknown app." };
  if (!isOneOf(WOULD_USE, input.wouldUse)) return { ok: false, error: "Say whether you'd use it." };
  const rating = Number(input.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: "Pick a rating from 1 to 5 stars." };
  const worked = input.worked.trim();
  const confusing = input.confusing.trim();
  if (worked.length < 10) return { ok: false, error: "Tell them what worked (at least 10 characters)." };
  if (worked.length > 1000 || confusing.length > 1000) return { ok: false, error: "Keep each answer under 1,000 characters." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("feedback")
    .insert({ app_id: appId, user_id: auth.viewer.id, would_use: input.wouldUse, rating, worked, confusing })
    .select("earned")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "You've already given feedback on this app." };
    // Row level security says no: they haven't tried it, or it's their own app.
    if (error.code === "42501") return { ok: false, error: "Open the app with Try it first, then come back to give feedback." };
    return { ok: false, error: "Couldn't save your feedback." };
  }
  revalidatePath(`/apps/${appSlug}`);
  revalidatePath("/test");
  revalidatePath("/credits");
  return { ok: true, earned: data?.earned ?? 0 };
}

function rpcError(message: string | undefined, fallback: string): string {
  // Messages raised by our database functions are written for people; anything else isn't.
  return message && !/permission|violates|function|column|relation/i.test(message) ? message : fallback;
}

export async function requestTesters(appId: string, appSlug: string, testers: number): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(appId)) return { ok: false, error: "Unknown app." };
  if (!TESTER_PACKS.includes(testers as (typeof TESTER_PACKS)[number])) return { ok: false, error: "Pick a tester pack." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_testers", { p_app_id: appId, p_testers: testers });
  if (error) return { ok: false, error: rpcError(error.message, "Couldn't add testers.") };
  revalidatePath(`/apps/${appSlug}`);
  revalidatePath("/test");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function cancelTesters(appId: string, appSlug: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(appId)) return { ok: false, error: "Unknown app." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_test_request", { p_app_id: appId });
  if (error) return { ok: false, error: rpcError(error.message, "Couldn't cancel.") };
  revalidatePath(`/apps/${appSlug}`);
  revalidatePath("/test");
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function markHelpful(feedbackId: string, appSlug: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(feedbackId)) return { ok: false, error: "Unknown feedback." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_feedback_helpful", { p_feedback_id: feedbackId });
  if (error) return { ok: false, error: rpcError(error.message, "Couldn't mark that as helpful.") };
  revalidatePath(`/apps/${appSlug}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phase 3: launch days and boosts
// ---------------------------------------------------------------------------

// Signed-in check first (so demo mode explains itself), then input checks, then the database function.
async function callRpc(
  fn: string,
  args: Record<string, unknown>,
  fallback: string,
  paths: string[],
  invalid: string | null = null,
): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (invalid) return { ok: false, error: invalid };
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: rpcError(error.message, fallback) };
  for (const path of paths) revalidatePath(path);
  revalidatePath("/", "layout");
  return { ok: true };
}

const unknownApp = (id: string) => (UUID.test(id) ? null : "Unknown app.");

export async function scheduleLaunch(appId: string, appSlug: string, at: string): Promise<ActionResult> {
  const when = new Date(at);
  const invalid = unknownApp(appId) ?? (Number.isNaN(when.getTime()) ? "Pick a date and time." : null);
  return callRpc(
    "schedule_launch",
    { p_app_id: appId, p_at: invalid ? null : when.toISOString() },
    "Couldn't schedule the launch.",
    [`/apps/${appSlug}`],
    invalid,
  );
}

export async function cancelLaunch(appId: string, appSlug: string): Promise<ActionResult> {
  return callRpc("cancel_launch", { p_app_id: appId }, "Couldn't cancel the launch.", [`/apps/${appSlug}`], unknownApp(appId));
}

// Books one of the 4 Spotlight spots for 3 days: now, or in line for the next
// free one.
export async function bookSpotlight(appId: string, appSlug: string): Promise<ActionResult> {
  return callRpc("book_spotlight", { p_app_id: appId }, "Couldn't book the Spotlight.", [`/apps/${appSlug}`], unknownApp(appId));
}

// ---------------------------------------------------------------------------
// Phase 3: build-in-public updates
// ---------------------------------------------------------------------------

export async function postUpdate(body: string, appId: string | null): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  const text = body.trim();
  if (!text) return { ok: false, error: "Write something first." };
  if (text.length > 500) return { ok: false, error: "Updates can be up to 500 characters." };
  if (appId && !UUID.test(appId)) return { ok: false, error: "Unknown app." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("updates")
    .insert({ user_id: auth.viewer.id, app_id: appId || null, body: text })
    .select("app:apps(slug)")
    .single();
  if (error) return { ok: false, error: "Couldn't post your update." };
  revalidatePath("/");
  revalidatePath(`/u/${auth.viewer.username}`);
  const slug = (data?.app as unknown as { slug: string } | null)?.slug;
  if (slug) revalidatePath(`/apps/${slug}`);
  return { ok: true };
}

export async function deleteUpdate(updateId: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(updateId)) return { ok: false, error: "Unknown update." };
  const supabase = await createClient();
  const { error } = await supabase.from("updates").delete().eq("id", updateId).eq("user_id", auth.viewer.id);
  if (error) return { ok: false, error: "Couldn't delete that update." };
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phase 3: swaps and co-launches
// ---------------------------------------------------------------------------

export async function proposeSwap(
  fromAppId: string,
  toAppId: string,
  kind: "swap" | "colaunch",
  launchAt: string | null,
): Promise<ActionResult> {
  const when = launchAt ? new Date(launchAt) : null;
  const invalid =
    unknownApp(fromAppId) ??
    unknownApp(toAppId) ??
    (kind !== "swap" && kind !== "colaunch" ? "Pick swap or co-launch." : null) ??
    (kind === "colaunch" && (!when || Number.isNaN(when.getTime())) ? "Pick a launch date and time." : null);
  return callRpc(
    "propose_swap",
    { p_from: fromAppId, p_to: toAppId, p_kind: kind, p_launch_at: kind === "colaunch" && when ? when.toISOString() : null },
    "Couldn't send the request.",
    ["/swaps"],
    invalid,
  );
}

export async function respondSwap(swapId: string, accept: boolean): Promise<ActionResult> {
  return callRpc("respond_swap", { p_swap_id: swapId, p_accept: accept }, "Couldn't answer the request.", ["/swaps"], UUID.test(swapId) ? null : "Unknown request.");
}

export async function endSwap(swapId: string): Promise<ActionResult> {
  return callRpc("end_swap", { p_swap_id: swapId }, "Couldn't end it.", ["/swaps"], UUID.test(swapId) ? null : "Unknown request.");
}

// ---------------------------------------------------------------------------
// Phase 2: connections, messages, notifications
// ---------------------------------------------------------------------------

export async function requestConnection(profileId: string, reason: string, note: string): Promise<ActionResult & { accepted?: boolean }> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(profileId)) return { ok: false, error: "Unknown builder." };
  if (!isOneOf(CONNECT_REASONS, reason)) return { ok: false, error: "Pick why you want to connect." };
  if (note.length > 280) return { ok: false, error: "Keep the note under 280 characters." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_connection", { p_to: profileId, p_reason: reason, p_note: note.trim() });
  if (error) return { ok: false, error: rpcError(error.message, "Couldn't send the request.") };
  revalidatePath("/", "layout");
  return { ok: true, accepted: data === "accepted" };
}

export async function respondConnection(id: string, accept: boolean): Promise<ActionResult> {
  return callRpc("respond_connection", { p_id: id, p_accept: accept }, "Couldn't answer the request.", ["/inbox"], UUID.test(id) ? null : "Unknown request.");
}

export async function removeConnection(id: string): Promise<ActionResult> {
  return callRpc("remove_connection", { p_id: id }, "Couldn't remove it.", ["/inbox"], UUID.test(id) ? null : "Unknown connection.");
}

export async function sendMessage(recipientId: string, username: string, body: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(recipientId)) return { ok: false, error: "Unknown builder." };
  const text = body.trim();
  if (!text) return { ok: false, error: "Write something first." };
  if (text.length > 2000) return { ok: false, error: "Messages can be up to 2,000 characters." };
  const supabase = await createClient();
  const { error } = await supabase.from("messages").insert({ sender_id: auth.viewer.id, recipient_id: recipientId, body: text });
  if (error) {
    if (error.code === "42501") return { ok: false, error: "You can message people once you're connected." };
    return { ok: false, error: "Couldn't send your message." };
  }
  revalidatePath(`/inbox/${username}`);
  return { ok: true };
}

export async function markThreadRead(otherId: string): Promise<void> {
  if (!isSupabaseConfigured || !UUID.test(otherId)) return;
  const supabase = await createClient();
  await supabase.rpc("mark_thread_read", { p_other: otherId });
  revalidatePath("/", "layout");
}

export async function markNotificationsRead(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read");
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------------
// Phase 2: Q&A
// ---------------------------------------------------------------------------

function qaPath(appSlug: string) {
  return `/apps/${appSlug}`;
}

// Ask about an app, optionally with a one-tap poll (2-4 choices).
export async function askQuestion(
  appId: string,
  appSlug: string,
  body: string,
  pollOptions: string[] | null = null,
): Promise<ActionResult & { id?: string }> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(appId)) return { ok: false, error: "Unknown app." };
  const text = body.trim();
  if (text.length < 5) return { ok: false, error: "Ask a bit more (at least 5 characters)." };
  if (text.length > 500) return { ok: false, error: "Questions can be up to 500 characters." };
  const options = pollOptions?.map((o) => o.trim()).filter(Boolean) ?? [];
  if (pollOptions && (options.length < 2 || options.length > 4)) return { ok: false, error: "A poll needs 2 to 4 choices." };
  if (options.some((o) => o.length > 60)) return { ok: false, error: "Keep each choice under 60 characters." };
  const supabase = await createClient();
  const row = { app_id: appId, user_id: auth.viewer.id, body: text, ...(options.length ? { poll_options: options } : {}) };
  const { data, error } = await supabase.from("questions").insert(row).select("id").single();
  if (error) {
    if (options.length && (error.code === "PGRST204" || error.code === "42703")) {
      return { ok: false, error: "Polls need the latest database update. Open /api/health to see what to run." };
    }
    return { ok: false, error: "Couldn't post your question." };
  }
  revalidatePath(qaPath(appSlug));
  revalidatePath("/drops");
  return { ok: true, id: data.id as string };
}

// Pick a poll choice (0-based), change it, or pass null to take it back.
export async function votePoll(questionId: string, choice: number | null): Promise<ActionResult & { counts?: number[] }> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(questionId)) return { ok: false, error: "Unknown question." };
  if (choice !== null && (!Number.isInteger(choice) || choice < 0 || choice > 3)) return { ok: false, error: "Pick one of the choices." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("vote_poll", { p_question: questionId, p_choice: choice });
  if (error) return { ok: false, error: error.code === "P0001" ? error.message : "Couldn't save your vote." };
  return { ok: true, counts: data as number[] };
}

// Answer a question, or with parentId, reply to an answer on it.
export async function answerQuestion(
  questionId: string,
  appSlug: string,
  body: string,
  parentId: string | null = null,
): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(questionId) || (parentId !== null && !UUID.test(parentId))) return { ok: false, error: "Unknown question." };
  const text = body.trim();
  if (!text) return { ok: false, error: "Write an answer first." };
  if (text.length > 1000) return { ok: false, error: "Answers can be up to 1,000 characters." };
  const supabase = await createClient();
  const row = { question_id: questionId, user_id: auth.viewer.id, body: text, ...(parentId ? { parent_id: parentId } : {}) };
  const { error } = await supabase.from("answers").insert(row);
  if (error) {
    if (parentId && (error.code === "PGRST204" || error.code === "42703")) {
      return { ok: false, error: "Replies need the latest database update. Open /api/health to see what to run." };
    }
    return { ok: false, error: "Couldn't post your answer." };
  }
  revalidatePath(qaPath(appSlug));
  revalidatePath(`/q/${questionId}`);
  return { ok: true };
}

export async function setVote(kind: "question" | "answer", id: string, on: boolean): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(id)) return { ok: false, error: "Unknown post." };
  const supabase = await createClient();
  const table = kind === "question" ? "question_votes" : "answer_votes";
  const column = kind === "question" ? "question_id" : "answer_id";
  const { error } = on
    ? await supabase.from(table).insert({ user_id: auth.viewer.id, [column]: id })
    : await supabase.from(table).delete().eq("user_id", auth.viewer.id).eq(column, id);
  if (error?.code === "42501") return { ok: false, error: "You can't vote on your own post." };
  if (error && error.code !== "23505") return { ok: false, error: "Couldn't save your vote." };
  return { ok: true };
}

export async function markBestAnswer(questionId: string, answerId: string, appSlug: string): Promise<ActionResult> {
  const invalid = UUID.test(questionId) && UUID.test(answerId) ? null : "Unknown answer.";
  return callRpc("mark_best_answer", { p_question: questionId, p_answer: answerId }, "Couldn't mark the best answer.", [qaPath(appSlug)], invalid);
}

export async function deletePost(kind: "question" | "answer", id: string, appSlug: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(id)) return { ok: false, error: "Unknown post." };
  const supabase = await createClient();
  const { error } = await supabase
    .from(kind === "question" ? "questions" : "answers")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.viewer.id);
  if (error) return { ok: false, error: "Couldn't delete it." };
  revalidatePath(qaPath(appSlug));
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phase 4: payments (Stripe Checkout)
// ---------------------------------------------------------------------------

type CheckoutResult = { ok: true; url: string } | { ok: false; error: string };

// Prepares the payment in the database as the payer (so every rule applies),
// then hands them to Stripe Checkout. The webhook completes it.
async function startCheckout(
  args: { kind: "tip" | "pro" | "sponsorship" | "credits" | "package"; ref: string | null; amount: number | null; note?: string; isPublic?: boolean },
  label: string,
  returnPath: string,
): Promise<CheckoutResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!isStripeConfigured || !createAdminClient()) return { ok: false, error: PAYMENTS_OFF_MESSAGE };

  const supabase = await createClient();
  const { data: paymentId, error } = await supabase.rpc("prepare_payment", {
    p_kind: args.kind,
    p_ref: args.ref,
    p_amount: args.amount,
    p_note: args.note ?? "",
    p_public: args.isPublic ?? true,
  });
  if (error || !paymentId) return { ok: false, error: rpcError(error?.message, "Couldn't start the payment.") };
  const { data: payment } = await supabase.from("payments").select("amount_cents").eq("id", paymentId).single();
  if (!payment) return { ok: false, error: "Couldn't start the payment." };

  const origin = await siteOrigin();
  try {
    const session = await createCheckout({
      paymentId,
      amountCents: payment.amount_cents,
      name: label,
      successUrl: `${origin}${returnPath}${returnPath.includes("?") ? "&" : "?"}paid=1`,
      cancelUrl: `${origin}${returnPath}`,
    });
    return { ok: true, url: session.url };
  } catch (e) {
    return { ok: false, error: e instanceof StripeError ? e.message : "Couldn't reach the payment service." };
  }
}

export async function backApp(appId: string, appSlug: string, amountCents: number, note: string, isPublic: boolean): Promise<CheckoutResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(appId) || !/^[a-z0-9-]+$/.test(appSlug)) return { ok: false, error: "Unknown app." };
  const amount = Math.round(Number(amountCents));
  if (!Number.isFinite(amount) || amount < EARN.tip.min || amount > EARN.tip.max) return { ok: false, error: "Tip between $1 and $500." };
  if (note.trim().length > 140) return { ok: false, error: "Keep the note under 140 characters." };
  return startCheckout(
    { kind: "tip", ref: appId, amount, note: note.trim(), isPublic },
    "Back an app on Method V",
    `/apps/${appSlug}`,
  );
}

export async function buyPro(): Promise<CheckoutResult> {
  return startCheckout({ kind: "pro", ref: null, amount: null }, `Method V Pro (${EARN.pro.days} days)`, "/pro");
}

// ---------------------------------------------------------------------------
// Sponsorship packages
// ---------------------------------------------------------------------------

export async function setSponsorPackage(
  appId: string,
  appSlug: string,
  kind: string,
  priceCents: number,
  note: string,
  active: boolean,
): Promise<ActionResult> {
  const price = Math.round(Number(priceCents));
  const invalid =
    unknownApp(appId) ??
    (packageFor(kind) ? null : "Unknown package.") ??
    (Number.isFinite(price) && price >= PACKAGE_RULES.minCents && price <= PACKAGE_RULES.maxCents
      ? null
      : "Set a price between $10 and $1,000.") ??
    (note.trim().length > 140 ? "Keep the note under 140 characters." : null);
  return callRpc(
    "set_sponsor_package",
    { p_app: appId, p_kind: kind, p_price: price, p_note: note.trim(), p_active: active },
    "Couldn't save that package.",
    [`/apps/${appSlug}`],
    invalid,
  );
}

// A sponsor picks a package: the deal is made, then they pay at Stripe. The
// builder is asked once the payment lands.
export async function sponsorPackage(
  hostAppId: string,
  hostName: string,
  kind: string,
  sponsorId: string,
  sponsorKind: "app" | "brand",
  brief: string,
): Promise<CheckoutResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  const pkg = packageFor(kind);
  if (!UUID.test(hostAppId) || !UUID.test(sponsorId) || !pkg) return { ok: false, error: "Pick a package." };
  if (brief.trim().length > 500) return { ok: false, error: "Keep the brief under 500 characters." };
  if (!isStripeConfigured || !createAdminClient()) return { ok: false, error: PAYMENTS_OFF_MESSAGE };
  const supabase = await createClient();
  const { data: dealId, error } = await supabase.rpc("request_package", {
    p_host_app: hostAppId,
    p_kind: kind,
    p_sponsor_app: sponsorKind === "app" ? sponsorId : null,
    p_sponsor_brand: sponsorKind === "brand" ? sponsorId : null,
    p_brief: brief.trim(),
  });
  if (error || !dealId) return { ok: false, error: rpcError(error?.message, "Couldn't start the sponsorship.") };
  return startCheckout({ kind: "package", ref: dealId as string, amount: null }, `${pkg.label} on ${hostName.slice(0, 60)}`, "/earn");
}

// Finish paying for a package you picked but didn't pay for.
export async function payPackage(dealId: string): Promise<CheckoutResult> {
  if (!UUID.test(dealId)) return { ok: false, error: "Unknown sponsorship." };
  return startCheckout({ kind: "package", ref: dealId, amount: null }, "Method V sponsorship", "/earn");
}

// Runs a package step; any payment it marks for refund is refunded straight away.
async function packageStep(fn: string, args: Record<string, unknown>, fallback: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (typeof args.p_id !== "string" || !UUID.test(args.p_id)) return { ok: false, error: "Unknown sponsorship." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, error: rpcError(error.message, fallback) };
  const admin = createAdminClient();
  if (typeof data === "string" && admin) await settleRefunds(admin, { paymentId: data });
  revalidatePath("/earn");
  return { ok: true };
}

export async function respondPackage(dealId: string, accept: boolean): Promise<ActionResult> {
  return packageStep("respond_package", { p_id: dealId, p_accept: accept }, "Couldn't answer that request.");
}

export async function deliverPackage(dealId: string, proofUrl: string): Promise<ActionResult> {
  const url = proofUrl.trim();
  if (!/^https:\/\/\S+$/.test(url) || url.length > 500) return { ok: false, error: "Add the https:// link to where it's live." };
  return packageStep("deliver_package", { p_id: dealId, p_proof: url }, "Couldn't mark it delivered.");
}

export async function approvePackage(dealId: string): Promise<ActionResult> {
  return packageStep("approve_package", { p_id: dealId }, "Couldn't approve it.");
}

export async function cancelPackage(dealId: string): Promise<ActionResult> {
  return packageStep("cancel_package", { p_id: dealId }, "Couldn't cancel it.");
}

export async function reportPackage(dealId: string, problem: string): Promise<ActionResult> {
  const text = problem.trim();
  if (text.length < 5 || text.length > 500) return { ok: false, error: "Say what went wrong (up to 500 characters)." };
  return packageStep("report_package", { p_id: dealId, p_problem: text }, "Couldn't send the report.");
}

// Credits are sold on the website only (the phone app shows the balance).
export async function buyCredits(credits: number): Promise<CheckoutResult> {
  const pack = CREDIT_PACKS.find((p) => p.credits === credits);
  if (!pack) return { ok: false, error: "Pick a credit pack." };
  return startCheckout({ kind: "credits", ref: null, amount: pack.credits }, `${pack.credits} V Coin (Method V credits)`, "/credits");
}

export async function fundSponsorship(id: string): Promise<CheckoutResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(id)) return { ok: false, error: "Unknown deal." };
  return startCheckout({ kind: "sponsorship", ref: id, amount: null }, "Boost Exchange sponsorship budget", "/earn");
}

// ---------------------------------------------------------------------------
// Phase 4: payouts (Stripe Connect)
// ---------------------------------------------------------------------------

export async function setUpPayouts(): Promise<CheckoutResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  if (!isStripeConfigured || !admin) return { ok: false, error: PAYMENTS_OFF_MESSAGE };

  try {
    const { data: existing } = await admin
      .from("payout_accounts")
      .select("stripe_account_id")
      .eq("user_id", auth.viewer.id)
      .maybeSingle();
    let accountId = existing?.stripe_account_id as string | undefined;
    if (!accountId) {
      accountId = (await createConnectAccount(auth.viewer.id)).id;
      const { error } = await admin.from("payout_accounts").insert({ user_id: auth.viewer.id, stripe_account_id: accountId });
      if (error) return { ok: false, error: "Couldn't save your payout account." };
    }
    const origin = await siteOrigin();
    const link = await createOnboardingLink(accountId, `${origin}/earn?setup=retry`, `${origin}/earn?setup=done`);
    return { ok: true, url: link.url };
  } catch (e) {
    return { ok: false, error: e instanceof StripeError ? e.message : "Couldn't reach the payment service." };
  }
}

export async function cashOut(): Promise<ActionResult & { amount?: number }> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  const admin = createAdminClient();
  if (!isStripeConfigured || !admin) return { ok: false, error: PAYMENTS_OFF_MESSAGE };

  const { data, error } = await admin.rpc("start_payout", { p_user: auth.viewer.id });
  const payout = (data as { payout_id: string; amount_cents: number; stripe_account_id: string }[] | null)?.[0];
  if (error || !payout) return { ok: false, error: rpcError(error?.message, "Couldn't start the payout.") };

  // Same idempotency key both times, so a retry after a timeout can't pay twice.
  let transferId: string | null = null;
  for (let attempt = 0; attempt < 2 && !transferId; attempt++) {
    try {
      transferId = (await createTransfer(payout.payout_id, payout.amount_cents, payout.stripe_account_id)).id;
    } catch (e) {
      console.error("Transfer failed", payout.payout_id, e);
    }
  }
  await admin.rpc("finish_payout", { p_id: payout.payout_id, p_transfer: transferId });
  revalidatePath("/earn");
  if (!transferId) return { ok: false, error: "The transfer didn't go through, so your balance is back. Try again later." };
  return { ok: true, amount: payout.amount_cents };
}

// ---------------------------------------------------------------------------
// Phase 4: Boost Exchange, paid
// ---------------------------------------------------------------------------

export async function respondSponsorship(id: string, accept: boolean): Promise<ActionResult> {
  return callRpc("respond_sponsorship", { p_id: id, p_accept: accept }, "Couldn't answer the offer.", ["/earn"], UUID.test(id) ? null : "Unknown deal.");
}

export async function endSponsorship(id: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(id)) return { ok: false, error: "Unknown deal." };
  const supabase = await createClient();
  const { data: refundPayment, error } = await supabase.rpc("end_sponsorship", { p_id: id });
  if (error) return { ok: false, error: rpcError(error.message, "Couldn't end the deal.") };
  const admin = createAdminClient();
  if (refundPayment && admin) await settleRefunds(admin, { paymentId: refundPayment as string });
  revalidatePath("/earn");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phase 4: challenges and Pro
// ---------------------------------------------------------------------------

export async function enterChallenge(challengeId: string, slug: string, appId: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(challengeId) || !UUID.test(appId)) return { ok: false, error: "Pick one of your apps." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("challenge_entries")
    .insert({ challenge_id: challengeId, app_id: appId, user_id: auth.viewer.id });
  if (error?.code === "23505") return { ok: false, error: "That app is already entered." };
  if (error) return { ok: false, error: rpcError(error.message, "Couldn't enter that app.") };
  revalidatePath(`/challenges/${slug}`);
  revalidatePath("/challenges");
  return { ok: true };
}

export async function withdrawEntry(entryId: string, slug: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(entryId)) return { ok: false, error: "Unknown entry." };
  const supabase = await createClient();
  const { error } = await supabase.from("challenge_entries").delete().eq("id", entryId).eq("user_id", auth.viewer.id);
  if (error) return { ok: false, error: "Couldn't withdraw that entry." };
  revalidatePath(`/challenges/${slug}`);
  return { ok: true };
}

// Voting for an entry replaces any earlier vote in the same challenge.
export async function voteEntry(challengeId: string, slug: string, entryId: string | null): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(challengeId) || (entryId && !UUID.test(entryId))) return { ok: false, error: "Unknown entry." };
  const supabase = await createClient();
  const { error: delError } = await supabase
    .from("challenge_votes")
    .delete()
    .eq("challenge_id", challengeId)
    .eq("user_id", auth.viewer.id);
  if (delError) return { ok: false, error: "Couldn't change your vote." };
  if (entryId) {
    const { error } = await supabase
      .from("challenge_votes")
      .insert({ challenge_id: challengeId, user_id: auth.viewer.id, entry_id: entryId });
    if (error) return { ok: false, error: rpcError(error.message, "Couldn't save your vote.") };
  }
  revalidatePath(`/challenges/${slug}`);
  return { ok: true };
}

export async function pinApp(appId: string | null): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (appId && !UUID.test(appId)) return { ok: false, error: "Unknown app." };
  const supabase = await createClient();
  const { error } = await supabase.from("profiles").update({ pinned_app_id: appId }).eq("id", auth.viewer.id);
  if (error) return { ok: false, error: rpcError(error.message, "Couldn't pin that app.") };
  revalidatePath(`/u/${auth.viewer.username}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Phase 5: brands on the Boost Exchange
// ---------------------------------------------------------------------------

export type NewBrand = { name: string; tagline: string; description: string; url: string };

// Lists a brand. Like apps, it only goes live after the server checks its
// link; it can sponsor once the Method V team verifies it.
export async function createBrand(input: NewBrand): Promise<ActionResult & { slug?: string }> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  const name = input.name.trim();
  const tagline = input.tagline.trim();
  const description = input.description.trim();
  const url = input.url.trim();
  if (!name || name.length > 60) return { ok: false, error: "Brand name is required (up to 60 characters)." };
  if (!tagline || tagline.length > 120) return { ok: false, error: "Add a one-line description (up to 120 characters)." };
  if (description.length > 1000) return { ok: false, error: "Keep the description under 1,000 characters." };
  if (!/^https:\/\//i.test(url)) return { ok: false, error: "Use your site's https:// address." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "The server is missing SUPABASE_SECRET_KEY, so it can't verify links yet." };
  const link = await checkLink(url);
  if (!link.ok) return { ok: false, error: `Link check failed: ${link.reason}` };

  const supabase = await createClient();
  const base = slugify(name);
  let brand: { id: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 5 && !brand; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      .from("brands")
      .insert({ owner_id: auth.viewer.id, slug, name, tagline, description, url })
      .select("id, slug")
      .single();
    if (data) brand = data;
    else if (error?.code !== "23505") return { ok: false, error: rpcError(error?.message, "Couldn't save the brand.") };
  }
  if (!brand) return { ok: false, error: "Couldn't pick a link for the brand. Try a slightly different name." };

  const { error } = await admin.from("brands").update({ link_checked_at: new Date().toISOString() }).eq("id", brand.id);
  if (error) return { ok: false, error: "Couldn't finish listing the brand." };
  revalidatePath("/brands");
  return { ok: true, slug: brand.slug };
}

export async function deleteBrand(brandId: string): Promise<ActionResult> {
  const auth = await requireViewer();
  if ("error" in auth) return { ok: false, error: auth.error };
  if (!UUID.test(brandId)) return { ok: false, error: "Unknown brand." };
  const supabase = await createClient();
  const { error } = await supabase.from("brands").delete().eq("id", brandId).eq("owner_id", auth.viewer.id);
  if (error) return { ok: false, error: rpcError(error.message, "Couldn't delete the brand.") };
  revalidatePath("/brands");
  return { ok: true };
}
