import { NextResponse, type NextRequest } from "next/server";

import { getViewer } from "@/lib/data";
import { demoBrands } from "@/lib/demo";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Brand links (brand pages and brand sponsor cards) go through here: count a
// sponsored try if the tap came from a sponsor card, then send the person on.
// Only redirects to a URL stored on a link-checked brand.
export async function GET(request: NextRequest, ctx: RouteContext<"/go/[slug]">) {
  const { slug } = await ctx.params;

  if (!isSupabaseConfigured) {
    const brand = demoBrands.find((b) => b.slug === slug);
    return brand ? NextResponse.redirect(brand.url, 303) : new NextResponse("Not found", { status: 404 });
  }

  const supabase = await createClient();
  const { data: brand } = await supabase
    .from("brands")
    .select("id, url")
    .eq("slug", slug)
    .not("link_checked_at", "is", null)
    .maybeSingle();
  if (!brand) return new NextResponse("Not found", { status: 404 });

  const sponsorship = request.nextUrl.searchParams.get("s");
  if (sponsorship && UUID.test(sponsorship) && (await getViewer())) {
    // The database decides whether it counts, exactly as for app sponsors.
    await supabase.rpc("record_sponsored_try", { p_id: sponsorship, p_app: brand.id });
  }
  return NextResponse.redirect(brand.url, 303);
}
