import "server-only";

import { cookies } from "next/headers";

import { REF_COOKIE, REF_PATTERN } from "./gate";
import { createClient } from "./supabase/server";
import { isSupabaseConfigured } from "./supabase/env";

// Invite links: methodv.app/?ref=<username>. The proxy keeps the username in
// a cookie for 30 days; once the new member is signed in, it's recorded
// (set_referrer(): only within 7 days of joining, once, never yourself) and
// the cookie is cleared. The bonus is paid later, when they post their first
// Drop or earn their first feedback reward.
export async function applyReferral(): Promise<void> {
  if (!isSupabaseConfigured) return;
  const jar = await cookies();
  const ref = jar.get(REF_COOKIE)?.value?.toLowerCase();
  if (!ref) return;
  if (REF_PATTERN.test(ref)) {
    const { error } = await (await createClient()).rpc("set_referrer", { p_username: ref });
    if (error && error.code !== "PGRST202" && error.code !== "42883") console.error("set_referrer failed", error.code, error.message);
  }
  jar.delete(REF_COOKIE);
}
