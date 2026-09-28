import { NextResponse } from "next/server";

import { removePost } from "@/lib/remove-post";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { DEMO_MODE_MESSAGE, isSupabaseConfigured } from "@/lib/supabase/env";

// The app's Remove on a question or answer: your own, or anything in your
// app's Q&A (same rules as the website, see lib/remove-post.ts).
export async function POST(request: Request) {
  if (!isSupabaseConfigured) return NextResponse.json({ error: DEMO_MODE_MESSAGE }, { status: 503 });
  const auth = await clientFromBearer(request);
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { kind?: unknown; id?: unknown } | null;
  const kind = body?.kind === "answer" ? "answer" : body?.kind === "question" ? "question" : null;
  if (!kind || typeof body?.id !== "string") return NextResponse.json({ error: "Unknown post." }, { status: 400 });
  const result = await removePost(auth.supabase, auth.userId, kind, body.id);
  return result.ok ? NextResponse.json({ removed: true }) : NextResponse.json({ error: result.error }, { status: 400 });
}
