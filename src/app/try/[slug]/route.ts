import { NextResponse, type NextRequest } from "next/server";

import { getViewer } from "@/lib/data";
import { demoApps } from "@/lib/demo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

// Every "Try it" button links here: record the try, then send the person to
// the app. Only redirects to a URL stored on a link-checked app.
export async function GET(_request: NextRequest, ctx: RouteContext<"/try/[slug]">) {
  const { slug } = await ctx.params;

  if (!isSupabaseConfigured) {
    const app = demoApps.find((a) => a.slug === slug);
    return app ? NextResponse.redirect(app.url, 303) : new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const { data: app } = await supabase
    .from("apps")
    .select("id, url")
    .eq("slug", slug)
    .not("link_checked_at", "is", null)
    .maybeSingle();
  if (!app) return new NextResponse("Not found", { status: 404 });

  const viewer = await getViewer();
  // A repeat try by the same signed-in person hits a unique index and is
  // simply not counted again.
  await supabase.from("try_clicks").insert({ app_id: app.id, user_id: viewer?.id ?? null });

  return NextResponse.redirect(app.url, 303);
}
