import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { isOpenPath, welcomeUrl } from "@/lib/gate";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

// Refreshes the Supabase session cookie before each page renders, and sends
// signed-out visitors to the welcome page first (see src/lib/gate.ts).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  if (!isSupabaseConfigured) return response;

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const { pathname, search } = request.nextUrl;
  if (!data?.claims && !isOpenPath(pathname)) {
    const url = new URL(welcomeUrl(pathname, search), request.url);
    const redirect = NextResponse.redirect(url);
    // Keep any refreshed cookies.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)"],
};
