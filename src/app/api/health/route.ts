import { NextResponse } from "next/server";

import { isStripeConfigured } from "@/lib/stripe";
import { authProviders, isSupabaseConfigured } from "@/lib/supabase/env";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Setup check: open /api/health after deploying to see what's connected and
// what's missing. Never shows keys or data, only yes/no and what to do next.
export async function GET() {
  const checks: Record<string, { ok: boolean; note: string }> = {};

  checks.supabase_keys = isSupabaseConfigured
    ? { ok: true, note: "The Supabase URL and public key are set." }
    : { ok: false, note: missingKeysNote() };

  if (isSupabaseConfigured) {
    const supabase = await createClient();
    const { error: reach } = await supabase.from("apps").select("id", { head: true, count: "exact" }).limit(1);
    // Profile photos (avatar_path) are from the newest migration, so they show the database is up to date.
    const { error: latest } = await supabase.from("profiles").select("avatar_path", { head: true }).limit(1);
    checks.database = reach
      ? { ok: false, note: /relation|does not exist|schema cache/i.test(reach.message) ? "Tables are missing: run supabase/setup.sql in the Supabase SQL Editor." : "Can't reach the database: check the Supabase URL and key." }
      : latest
        ? { ok: false, note: "The database is behind: in Supabase → SQL Editor, run supabase/migrations/20261001000000_avatars.sql (profile photos). If brands is missing too, run the newer migration files you haven't run yet." }
        : { ok: true, note: "Connected, and the tables are up to date." };

    const admin = createAdminClient();
    if (!admin) {
      checks.secret_key = {
        ok: false,
        note: "Add SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY), server only. Without it nobody can post, because links can't be verified.",
      };
    } else {
      const { error } = await admin.from("payout_accounts").select("user_id", { head: true }).limit(1);
      checks.secret_key = error
        ? { ok: false, note: "The secret key is set but doesn't work: copy it again from Supabase → Project Settings → API Keys." }
        : { ok: true, note: "Set and working." };
    }
  }

  checks.site_url = process.env.NEXT_PUBLIC_SITE_URL
    ? { ok: true, note: "Set." }
    : { ok: false, note: "Optional but recommended: set NEXT_PUBLIC_SITE_URL to your live address (e.g. https://methodv.app) so sign-in emails link to it." };

  checks.one_tap_sign_in = {
    ok: true,
    note: authProviders.length ? `On: ${authProviders.join(", ")}.` : "Off (optional). Email + password and emailed links work without it.",
  };
  checks.payments = {
    ok: true,
    note: isStripeConfigured ? "Stripe is on." : "Off (optional). Add STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET to turn on tips, sponsorships and Pro.",
  };

  const required = ["supabase_keys", "database", "secret_key"];
  const ready = required.every((k) => checks[k]?.ok);
  return NextResponse.json(
    { ready, summary: ready ? "Method V is live and ready for sign-ups." : "Almost there: fix the items marked ok: false.", checks },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// Why the site can't see its Supabase keys. A deployment keeps the variables
// it was deployed with, so ones added later need a redeploy. Lists the names
// of Supabase variables this deployment can see (names only, never values) to
// tell missing ones from misnamed ones.
function missingKeysNote(): string {
  const seen = Object.keys(process.env)
    .filter((k) => /SUPABASE/i.test(k))
    .sort();
  const hasUrl = seen.includes("NEXT_PUBLIC_SUPABASE_URL");
  const hasKey = seen.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY") || seen.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (hasUrl && hasKey) {
    return "NEXT_PUBLIC_SUPABASE_URL and the public key are there but empty in this deploy. Check they have values in Vercel → Settings → Environment Variables, then redeploy (Deployments → ⋯ → Redeploy).";
  }
  const want = "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)";
  if (seen.length > 0) {
    return `This deployment sees ${seen.join(", ")}, but the site needs ${want} with exactly those names. Add them in Vercel → Settings → Environment Variables (Production), then redeploy.`;
  }
  return `No Supabase variables reach this deployment. In Vercel → Settings → Environment Variables, make sure ${want} exist and are on for Production, then redeploy. Until then the site runs in demo mode.`;
}
