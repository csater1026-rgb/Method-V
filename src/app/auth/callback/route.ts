import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { safeNextPath } from "@/lib/gate";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const OTP_TYPES: EmailOtpType[] = ["signup", "email", "magiclink", "recovery", "email_change", "invite"];

// Every email link lands here: confirming a new account, the emailed sign-in
// link, a password reset. Two kinds of link:
//   - ?token_hash=…&type=… (our email templates): works in any browser or
//     email app, so tapping it on your phone after signing up on a laptop
//     still signs you in.
//   - ?code=… (Supabase's own link): only works in the browser where you
//     started. Opened anywhere else, Supabase has still confirmed the email,
//     so we say so and ask them to sign in, instead of "link expired".
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"));
  const toLogin = (flag: string) =>
    NextResponse.redirect(new URL(`/login?${flag}${next === "/" ? "" : `&next=${encodeURIComponent(next)}`}`, origin));
  if (!isSupabaseConfigured) return toLogin("error=link");
  const supabase = await createClient();

  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    if (!error) return NextResponse.redirect(new URL(next, origin));
    console.error("email link failed", type, error.code, error.message);
    return toLogin("error=expired");
  }

  const code = searchParams.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
    console.error("email link opened in another browser", error.code, error.message);
    return toLogin("confirmed=1");
  }

  // Supabase sends people back with ?error_code=otp_expired when a link was
  // already used or is too old.
  if (searchParams.get("error_code")) {
    console.error("email link refused", searchParams.get("error_code"), searchParams.get("error_description"));
    return toLogin("error=expired");
  }
  return toLogin("error=link");
}
