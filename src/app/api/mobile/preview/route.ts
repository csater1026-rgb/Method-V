import { NextResponse } from "next/server";

import { fetchPage } from "@/lib/link-check";
import { sitePreview } from "@/lib/site-preview";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { DEMO_MODE_MESSAGE, isSupabaseConfigured } from "@/lib/supabase/env";

// Fills in name, tagline and category from an app's website, for the mobile
// Post screen. Signed-in only, and fetchPage keeps its private-address checks.
export async function POST(request: Request) {
  if (!isSupabaseConfigured) return NextResponse.json({ error: DEMO_MODE_MESSAGE }, { status: 503 });
  if (!(await clientFromBearer(request))) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url.slice(0, 600) : "";
  const page = await fetchPage(url);
  if (!page.ok) return NextResponse.json({ error: page.reason }, { status: 400 });
  return NextResponse.json({ preview: sitePreview(page.html ?? "", page.finalUrl) });
}
