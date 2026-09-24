import { NextResponse } from "next/server";

import { sendToBrowsers, sendToPhones, webhookSecret } from "@/lib/push";
import { secretMatches, toMessage, type PushRow } from "@/lib/push-core";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Called by a Supabase Database Webhook each time a row lands in push_queue
// (see supabase/migrations/20261005000000_push.sql and the README). Only
// requests carrying the shared secret are accepted. Each row is claimed
// before sending, so a retried webhook never sends twice. A request without
// a row sends anything still waiting from the last day.
export async function POST(request: Request) {
  if (!webhookSecret) return new NextResponse("Push is off", { status: 404 });
  const given = request.headers.get("x-push-secret") ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!secretMatches(given, webhookSecret)) return new NextResponse("Unauthorized", { status: 401 });
  const admin = createAdminClient();
  if (!admin) return new NextResponse("Server not configured", { status: 503 });

  const payload = (await request.json().catch(() => ({}))) as { record?: { id?: unknown } };
  const id = Number(payload.record?.id);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const claim = admin.from("push_queue").update({ sent_at: new Date().toISOString() }).is("sent_at", null);
  const { data: rows, error } = await (Number.isSafeInteger(id) && id > 0
    ? claim.eq("id", id)
    : claim.gt("created_at", since)
  ).select("id, user_id, kind, title, body, url");
  if (error) {
    console.error("push_queue claim failed", error.message);
    return new NextResponse("Couldn't read the queue", { status: 500 });
  }

  let sent = 0;
  for (const row of (rows ?? []) as PushRow[]) {
    const message = toMessage(row);
    const [{ data: tokens }, { data: subs }] = await Promise.all([
      admin.from("push_tokens").select("token").eq("user_id", row.user_id),
      admin.from("web_push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", row.user_id),
    ]);
    const [phones, browsers] = await Promise.all([
      sendToPhones((tokens ?? []).map((t) => t.token as string), message).catch((e) => {
        console.error("Phone push failed", e);
        return { sent: 0, dead: [] as string[] };
      }),
      sendToBrowsers((subs ?? []) as { endpoint: string; p256dh: string; auth: string }[], message),
    ]);
    sent += phones.sent + browsers.sent;
    if (phones.dead.length) await admin.from("push_tokens").delete().in("token", phones.dead);
    if (browsers.dead.length) await admin.from("web_push_subscriptions").delete().in("endpoint", browsers.dead);
  }
  return NextResponse.json({ processed: rows?.length ?? 0, sent });
}
