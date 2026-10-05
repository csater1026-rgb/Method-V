import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CATEGORIES, MAX_DROP_SECONDS, PRICING, STAGES, isOneOf } from "./constants";
import { APP_LIMIT, appLimit, limitMessage } from "./app-limit";
import { dbMessage } from "./db-errors";
import { parseList, slugify } from "./format";
import { checkLink } from "./link-check";
import { createAdminClient } from "./supabase/server";

// Publishing an app with its Drop, shared by the website's Post screen and
// the mobile app (/api/mobile/apps). `supabase` acts as the poster, so row
// level security applies; only the link check's result is written with the
// secret key.

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
  // The Drop (a short video) is optional: without one the app still shows on
  // Browse, Featured and the builder's profile, just not in the Drops feed.
  videoPath: string | null;
  posterPath: string | null;
  durationSeconds: number | null;
  // The builder ticked the safety box on the Post screen.
  safetyChecked: boolean;
  // Optional cover image (drops/<id>/appcover-<time>.jpg) for the app's card.
  coverPath?: string | null;
};

export async function publishApp(
  supabase: SupabaseClient,
  viewerId: string,
  input: NewApp,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
  if (input.safetyChecked !== true) return { ok: false, error: "Tick the box to confirm your app is safe to share." };
  const name = input.name.trim();
  const tagline = input.tagline.trim();
  if (!name || name.length > 60) return { ok: false, error: "App name is required (up to 60 characters)." };
  if (!tagline || tagline.length > 120) return { ok: false, error: "Tagline is required (up to 120 characters)." };
  if (input.description.length > 2000) return { ok: false, error: "Description can be up to 2,000 characters." };
  if (input.caption.length > 300) return { ok: false, error: "Caption can be up to 300 characters." };
  if (!isOneOf(CATEGORIES, input.category)) return { ok: false, error: "Pick a category." };
  if (!isOneOf(PRICING, input.pricing)) return { ok: false, error: "Pick a pricing option." };
  if (!isOneOf(STAGES, input.stage)) return { ok: false, error: "Pick a stage." };
  const videoPath = input.videoPath || null;
  const duration = Number(input.durationSeconds);
  if (videoPath && (!Number.isFinite(duration) || duration <= 0 || duration > MAX_DROP_SECONDS)) {
    return { ok: false, error: `Drops can be up to ${MAX_DROP_SECONDS} seconds.` };
  }
  const ownFile = (p: string) => p.startsWith(`${viewerId}/`) && !p.includes("..") && p.length < 200;
  const coverPath = input.coverPath || null;
  if (coverPath && !new RegExp(`^${viewerId}/appcover-[0-9]+\\.jpg$`).test(coverPath)) {
    return { ok: false, error: "Upload the cover image again." };
  }
  if ((videoPath && !ownFile(videoPath)) || (videoPath && input.posterPath && !ownFile(input.posterPath))) {
    return { ok: false, error: "Upload the video again." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "The server is missing SUPABASE_SECRET_KEY, so it can't verify links yet." };
  }

  // 3 new apps every 30 days (the database enforces it too); checked before
  // the slow link check so nobody waits just to be told no.
  const { data: mine } = await supabase
    .from("apps")
    .select("created_at")
    .eq("owner_id", viewerId)
    .gt("created_at", new Date(Date.now() - APP_LIMIT.days * 24 * 60 * 60 * 1000).toISOString());
  const limit = appLimit((mine ?? []).map((a) => a.created_at as string));
  if (limit.nextAt) return { ok: false, error: limitMessage(limit.nextAt) };

  const link = await checkLink(input.url);
  if (!link.ok) return { ok: false, error: `Link check failed: ${link.reason}` };

  const base = slugify(name);
  let app: { id: string; slug: string } | null = null;
  for (let attempt = 0; attempt < 5 && !app; attempt++) {
    const slug = attempt === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase
      .from("apps")
      .insert({
        owner_id: viewerId,
        slug,
        name,
        tagline,
        description: input.description.trim(),
        url: input.url.trim(),
        category: input.category,
        tech_stack: parseList(input.techStack, 12),
        pricing: input.pricing,
        stage: input.stage,
        ...(coverPath ? { cover_path: coverPath } : {}),
      })
      .select("id, slug")
      .single();
    if (data) app = data;
    else if (error?.code !== "23505") return { ok: false, error: dbMessage(error, "Couldn't save your app.") };
  }
  if (!app) return { ok: false, error: "Couldn't pick a link for your app. Try a slightly different name." };

  const { error: markError } = await admin
    .from("apps")
    .update({ link_checked_at: new Date().toISOString() })
    .eq("id", app.id);

  const { error: dropError } = markError
    ? { error: markError }
    : videoPath
      ? await supabase.from("drops").insert({
          app_id: app.id,
          owner_id: viewerId,
          video_path: videoPath,
          poster_path: input.posterPath,
          duration_seconds: Math.round(duration * 100) / 100,
          caption: input.caption.trim(),
        })
      : { error: null };

  if (dropError) {
    await supabase.from("apps").delete().eq("id", app.id);
    return { ok: false, error: dbMessage(dropError, "Couldn't save your Drop.") };
  }
  return { ok: true, slug: app.slug };
}
