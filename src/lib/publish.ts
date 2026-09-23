import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { CATEGORIES, MAX_DROP_SECONDS, PRICING, STAGES, isOneOf } from "./constants";
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
  videoPath: string;
  posterPath: string | null;
  durationSeconds: number;
};

export async function publishApp(
  supabase: SupabaseClient,
  viewerId: string,
  input: NewApp,
): Promise<{ ok: true; slug: string } | { ok: false; error: string }> {
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
  const ownFile = (p: string) => p.startsWith(`${viewerId}/`) && !p.includes("..") && p.length < 200;
  if (!ownFile(input.videoPath) || (input.posterPath && !ownFile(input.posterPath))) {
    return { ok: false, error: "Upload the video again." };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "The server is missing SUPABASE_SECRET_KEY, so it can't verify links yet." };
  }

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
        owner_id: viewerId,
        video_path: input.videoPath,
        poster_path: input.posterPath,
        duration_seconds: Math.round(duration * 100) / 100,
        caption: input.caption.trim(),
      });

  if (dropError) {
    await supabase.from("apps").delete().eq("id", app.id);
    return { ok: false, error: "Couldn't save your Drop." };
  }
  return { ok: true, slug: app.slug };
}
