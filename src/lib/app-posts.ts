import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { APP_LIMIT } from "./app-limit";

// When someone posted apps in the last 30 days, for the app limit. Read from
// app_posts, which still has apps deleted since (they count); before that
// update (20261024000000_economy_fixes.sql) is run, from the apps they have.
export async function recentPostTimes(supabase: SupabaseClient, ownerId: string): Promise<string[]> {
  const since = new Date(Date.now() - APP_LIMIT.days * 24 * 60 * 60 * 1000).toISOString();
  const posts = await supabase.from("app_posts").select("created_at").eq("owner_id", ownerId).gt("created_at", since);
  if (!posts.error) return (posts.data ?? []).map((p) => p.created_at as string);
  const apps = await supabase.from("apps").select("created_at").eq("owner_id", ownerId).gt("created_at", since);
  return (apps.data ?? []).map((a) => a.created_at as string);
}
