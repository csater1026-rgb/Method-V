import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CATEGORIES, MAX_DROP_SECONDS, PRICING, STAGES, isOneOf } from "./constants";
import { dbMessage } from "./db-errors";
import { parseList } from "./format";
import { checkLink } from "./link-check";
import { DROPS_BUCKET, FEEDBACK_BUCKET } from "./supabase/env";
import { createAdminClient } from "./supabase/server";

// Everything a builder can change about an app they posted, from its Manage
// page: the details, the link, its Drops, or deleting it. `supabase` acts as
// the builder, so row level security and the column grants apply; the secret
// key is only used to mark a new link as checked (people can't do that
// themselves) and to clean up testers' screenshots when an app is deleted.

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export type AppDetailsInput = {
  name: string;
  tagline: string;
  description: string;
  category: string;
  pricing: string;
  stage: string;
  techStack: string;
};

export async function updateDetails(supabase: SupabaseClient, viewerId: string, appId: string, input: AppDetailsInput): Promise<Result<{ slug: string }>> {
  const name = String(input.name ?? "").trim();
  const tagline = String(input.tagline ?? "").trim();
  const description = String(input.description ?? "").trim();
  if (!name || name.length > 60) return { ok: false, error: "App name is required (up to 60 characters)." };
  if (!tagline || tagline.length > 120) return { ok: false, error: "Tagline is required (up to 120 characters)." };
  if (description.length > 2000) return { ok: false, error: "Description can be up to 2,000 characters." };
  if (!isOneOf(CATEGORIES, input.category)) return { ok: false, error: "Pick a category." };
  if (!isOneOf(PRICING, input.pricing)) return { ok: false, error: "Pick a pricing option." };
  if (!isOneOf(STAGES, input.stage)) return { ok: false, error: "Pick a stage." };
  const { data, error } = await supabase
    .from("apps")
    .update({
      name,
      tagline,
      description,
      category: input.category,
      pricing: input.pricing,
      stage: input.stage,
      tech_stack: parseList(String(input.techStack ?? ""), 12),
    })
    .eq("id", appId)
    .eq("owner_id", viewerId)
    .select("slug")
    .maybeSingle();
  if (error) return { ok: false, error: dbMessage(error, "Couldn't save your changes.") };
  if (!data) return { ok: false, error: "You can only edit your own apps." };
  return { ok: true, slug: data.slug as string };
}

// A new link goes through the same check as posting before it's saved.
export async function changeLink(supabase: SupabaseClient, viewerId: string, appId: string, url: string): Promise<Result<{ slug: string }>> {
  const { data: app } = await supabase.from("apps").select("id, slug, url").eq("id", appId).eq("owner_id", viewerId).maybeSingle();
  if (!app) return { ok: false, error: "You can only edit your own apps." };
  const next = String(url ?? "").trim();
  if (next === app.url) return { ok: true, slug: app.slug as string };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "The server is missing SUPABASE_SECRET_KEY, so it can't check links yet." };
  const link = await checkLink(next);
  if (!link.ok) return { ok: false, error: `Link check failed: ${link.reason}` };
  const { error } = await admin.from("apps").update({ url: next, link_checked_at: new Date().toISOString() }).eq("id", appId).eq("owner_id", viewerId);
  if (error) return { ok: false, error: "Couldn't save the new link." };
  return { ok: true, slug: app.slug as string };
}

export type NewDrop = { videoPath: string; posterPath: string | null; durationSeconds: number; caption: string };

export async function addDrop(supabase: SupabaseClient, viewerId: string, appId: string, input: NewDrop): Promise<Result<{ slug: string }>> {
  const { data: app } = await supabase.from("apps").select("id, slug").eq("id", appId).eq("owner_id", viewerId).maybeSingle();
  if (!app) return { ok: false, error: "You can only add Drops to your own apps." };
  const duration = Number(input.durationSeconds);
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DROP_SECONDS) return { ok: false, error: `Drops can be up to ${MAX_DROP_SECONDS} seconds.` };
  const caption = String(input.caption ?? "").trim();
  if (caption.length > 300) return { ok: false, error: "Caption can be up to 300 characters." };
  const ownFile = (p: unknown) => typeof p === "string" && p.startsWith(`${viewerId}/`) && !p.includes("..") && p.length < 200;
  if (!ownFile(input.videoPath) || (input.posterPath && !ownFile(input.posterPath))) return { ok: false, error: "Upload the video again." };
  const { error } = await supabase.from("drops").insert({
    app_id: app.id,
    owner_id: viewerId,
    video_path: input.videoPath,
    poster_path: input.posterPath || null,
    duration_seconds: Math.round(duration * 100) / 100,
    caption,
  });
  if (error) return { ok: false, error: dbMessage(error, "Couldn't add your Drop.") };
  return { ok: true, slug: app.slug as string };
}

export async function setDropCaption(supabase: SupabaseClient, viewerId: string, dropId: string, caption: string): Promise<Result> {
  const text = String(caption ?? "").trim();
  if (text.length > 300) return { ok: false, error: "Caption can be up to 300 characters." };
  const { data, error } = await supabase.from("drops").update({ caption: text }).eq("id", dropId).eq("owner_id", viewerId).select("id").maybeSingle();
  if (error) return { ok: false, error: dbMessage(error, "Couldn't save the caption.") };
  return data ? { ok: true } : { ok: false, error: "You can only edit your own Drops." };
}

export async function deleteDrop(supabase: SupabaseClient, viewerId: string, dropId: string): Promise<Result> {
  const { data: drop } = await supabase.from("drops").select("id, video_path, poster_path").eq("id", dropId).eq("owner_id", viewerId).maybeSingle();
  if (!drop) return { ok: false, error: "That Drop is already gone." };
  const { error } = await supabase.from("drops").delete().eq("id", dropId).eq("owner_id", viewerId);
  if (error) return { ok: false, error: dbMessage(error, "Couldn't delete that Drop.") };
  const files = [drop.video_path, drop.poster_path].filter((p): p is string => typeof p === "string" && p.startsWith(`${viewerId}/`));
  if (files.length) await supabase.storage.from(DROPS_BUCKET).remove(files);
  return { ok: true };
}

// Deal and sponsorship states where someone's money is held (as in
// delete-account.ts): an app in one of these can't be deleted yet.
const OPEN_DEALS = ["requested", "accepted", "delivered", "disputed"];
const OPEN_SPONSORSHIPS = ["offered", "accepted", "active"];

export async function deleteApp(supabase: SupabaseClient, viewerId: string, appId: string, typedName: string): Promise<Result> {
  const { data: app } = await supabase.from("apps").select("id, slug, name, cover_path").eq("id", appId).eq("owner_id", viewerId).maybeSingle();
  if (!app) return { ok: false, error: "That app is already gone." };
  if (String(typedName ?? "").trim().toLowerCase() !== String(app.name).trim().toLowerCase()) {
    return { ok: false, error: `Type the app's name (${app.name}) to confirm.` };
  }

  const admin = createAdminClient();
  const reader = admin ?? supabase;
  const either = `sponsor_app.eq.${appId},host_app.eq.${appId}`;
  const [deals, sponsorships] = await Promise.all([
    reader.from("package_deals").select("id", { count: "exact", head: true }).or(either).in("status", OPEN_DEALS),
    reader.from("sponsorships").select("id", { count: "exact", head: true }).or(either).in("status", OPEN_SPONSORSHIPS),
  ]);
  if ((deals.count ?? 0) > 0) {
    return { ok: false, error: "This app has a sponsorship deal in progress. Finish or cancel it on the Earn page first, so nobody loses their money." };
  }
  if ((sponsorships.count ?? 0) > 0) {
    return { ok: false, error: "This app has a sponsorship that's still running. End it on the Earn page first, so nobody loses their money." };
  }

  // Files to clean up once the app is gone: its videos, thumbnails and card
  // picture (in the builder's folder), and testers' feedback screenshots.
  const { data: drops } = await supabase.from("drops").select("video_path, poster_path").eq("app_id", appId);
  const ownFiles = [...(drops ?? []).flatMap((d) => [d.video_path, d.poster_path]), app.cover_path].filter(
    (p): p is string => typeof p === "string" && p.startsWith(`${viewerId}/`),
  );
  let shots: string[] = [];
  if (admin) {
    const { data: fb, error } = await admin.from("feedback").select("worked_shots, confusing_shots").eq("app_id", appId);
    if (!error) shots = (fb ?? []).flatMap((f) => [...(f.worked_shots ?? []), ...(f.confusing_shots ?? [])]);
  }

  // Bounties hold Methodium, and deleting the app would take them with it.
  // Answered ones need a winner first (or their deadline, when the answers
  // split the reward), so nobody's work goes unpaid; unanswered ones are
  // taken down and the reward comes back.
  await supabase.rpc("settle_bounties");
  const { data: openBounties } = await supabase.from("bounties").select("id, answer_count").eq("app_id", appId).eq("status", "open");
  if ((openBounties ?? []).some((b) => Number(b.answer_count) > 0)) {
    return { ok: false, error: "This app has a bounty people have answered. Pick the best answer first (or wait until its deadline), so nobody goes unpaid." };
  }
  for (const b of openBounties ?? []) {
    const { error: cancelError } = await supabase.rpc("cancel_bounty", { p_bounty: b.id });
    if (cancelError) return { ok: false, error: "Couldn't take down this app's bounty and give you its Methodium back. Try again in a minute." };
  }

  // Testers not used yet go back to the builder as credits.
  const { data: request } = await supabase.from("test_requests").select("slots_total, slots_filled").eq("app_id", appId).maybeSingle();
  if (request && request.slots_filled < request.slots_total) {
    const { error: refundError } = await supabase.rpc("cancel_test_request", { p_app_id: appId });
    if (refundError) return { ok: false, error: "Couldn't refund the testers you haven't used yet. Try again in a minute." };
  }

  const { error } = await supabase.from("apps").delete().eq("id", appId).eq("owner_id", viewerId);
  if (error) return { ok: false, error: dbMessage(error, "Couldn't delete your app. Try again in a minute.") };

  if (ownFiles.length) await supabase.storage.from(DROPS_BUCKET).remove(ownFiles);
  if (admin && shots.length) await admin.storage.from(FEEDBACK_BUCKET).remove(shots);
  return { ok: true };
}
