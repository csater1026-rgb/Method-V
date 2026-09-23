import { NextResponse, type NextRequest } from "next/server";

import { getViewer } from "@/lib/data";
import { demoApps } from "@/lib/demo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Every "Try it" button links here: record the try, then send the person to
// the app. Only redirects to a URL stored on a link-checked app. Sponsor cards
// add ?s=<sponsorship id>, which also charges the sponsor for a real try.
export async function GET(request: NextRequest, ctx: RouteContext<"/try/[slug]">) {
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

  const sponsorship = request.nextUrl.searchParams.get("s");
  if (viewer && sponsorship && UUID.test(sponsorship)) {
    // The database decides whether it counts (one per person, real accounts,
    // not either builder, and only for this sponsor's app).
    await supabase.rpc("record_sponsored_try", { p_id: sponsorship, p_app: app.id });
  }

  return NextResponse.redirect(app.url, 303);
}
