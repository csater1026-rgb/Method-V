import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { REF_COOKIE, REF_MAX_AGE, REF_PATTERN, agreeUrl, isOpenPath, landingFor, mustAgree, previewFor, welcomeUrl } from "@/lib/gate";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/env";

// Refreshes the Supabase session cookie before each page renders, shows
// signed-out visitors what Method V is at "/" (the welcome page anywhere
// else), and sends signed-in people who haven't agreed to the Terms yet to
// /agree (see src/lib/gate.ts).
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
  const claims = data?.claims;
  // Invite links (?ref=username): remember who sent a signed-out visitor.
  const ref = request.nextUrl.searchParams.get("ref")?.toLowerCase();
  if (!claims && ref && REF_PATTERN.test(ref)) {
    response.cookies.set(REF_COOKIE, ref, { path: "/", maxAge: REF_MAX_AGE, sameSite: "lax", httpOnly: true, secure: true });
  }
  // A link-preview bot asking for an app's page gets the app's preview card.
  const preview = claims ? null : previewFor(pathname, request.headers.get("user-agent"));
  if (preview) return NextResponse.rewrite(new URL(preview, request.url));
  // methodv.app signed out: the page that explains Method V, at the same address.
  const landing = claims ? null : landingFor(pathname);
  if (landing) {
    const rewrite = NextResponse.rewrite(new URL(landing + search, request.url));
    for (const cookie of response.cookies.getAll()) rewrite.cookies.set(cookie);
    return rewrite;
  }
  const target = !claims
    ? isOpenPath(pathname)
      ? null
      : welcomeUrl(pathname, search)
    : mustAgree(claims.user_metadata, pathname)
      ? agreeUrl(pathname, search)
      : null;
  if (target) {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    // Keep any refreshed cookies.
    for (const cookie of response.cookies.getAll()) redirect.cookies.set(cookie);
    return redirect;
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|webm)$).*)"],
};
