import { NextResponse } from "next/server";

import { publishApp } from "@/lib/publish";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { DEMO_MODE_MESSAGE, isSupabaseConfigured } from "@/lib/supabase/env";

const str = (v: unknown, max = 2000) => (typeof v === "string" ? v.slice(0, max) : "");

// The mobile app posts here after uploading the video to storage itself. Same
// checks as the website's Post screen (publishApp), including the link check.
export async function POST(request: Request) {
  if (!isSupabaseConfigured) return NextResponse.json({ error: DEMO_MODE_MESSAGE }, { status: 503 });
  const auth = await clientFromBearer(request);
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const result = await publishApp(auth.supabase, auth.userId, {
    name: str(body.name, 100),
    tagline: str(body.tagline, 200),
    description: str(body.description),
    url: str(body.url, 600),
    category: str(body.category, 40),
    techStack: str(body.techStack, 500),
    pricing: str(body.pricing, 20) || "free",
    stage: str(body.stage, 20) || "launched",
    caption: str(body.caption, 400),
    videoPath: str(body.videoPath, 300),
    posterPath: str(body.posterPath, 300) || null,
    durationSeconds: Number(body.durationSeconds),
  });
  return result.ok
    ? NextResponse.json({ slug: result.slug })
    : NextResponse.json({ error: result.error }, { status: 400 });
}
