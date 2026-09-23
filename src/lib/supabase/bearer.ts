import "server-only";

import { createClient as createPlainClient, type SupabaseClient } from "@supabase/supabase-js";

import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "./env";

// For the mobile app, which signs in on the phone and sends its access token
// as "Authorization: Bearer …". Returns a client that acts as that person (so
// row level security applies), or null if the token isn't valid.
export async function clientFromBearer(request: Request): Promise<{ supabase: SupabaseClient; userId: string } | null> {
  if (!isSupabaseConfigured) return null;
  const token = request.headers.get("authorization")?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!token) return null;
  const supabase = createPlainClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return { supabase, userId: data.user.id };
}
