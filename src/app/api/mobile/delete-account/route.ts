import { NextResponse } from "next/server";

import { deleteAccount } from "@/lib/delete-account";
import { clientFromBearer } from "@/lib/supabase/bearer";
import { DEMO_MODE_MESSAGE, isSupabaseConfigured } from "@/lib/supabase/env";

// The app's Delete account button (Me tab). The person is whoever the access
// token belongs to; they confirm by typing their username.
export async function POST(request: Request) {
  if (!isSupabaseConfigured) return NextResponse.json({ error: DEMO_MODE_MESSAGE }, { status: 503 });
  const auth = await clientFromBearer(request);
  if (!auth) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { confirm?: unknown } | null;
  const typed = typeof body?.confirm === "string" ? body.confirm.slice(0, 60) : "";
  const result = await deleteAccount(auth.userId, typed);
  return result.ok ? NextResponse.json({ deleted: true }) : NextResponse.json({ error: result.error }, { status: 400 });
}
