import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { supabasePublishableKey, supabaseUrl } from "./env";

// Acts as the signed-in person, so row level security applies.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components can't set cookies. The proxy refreshes the
          // session on every request, so this is safe to ignore.
        }
      },
    },
  });
}

// Bypasses row level security. Only used for writes people must not be able
// to make themselves, like marking an app's link as checked. Returns null
// when the secret key isn't set, so callers fail closed.
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !secret) return null;
  return createPlainClient(supabaseUrl, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
