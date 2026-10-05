import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { DropBonusBanner } from "@/components/DropBonus";
import { Coin } from "@/components/Coin";
import { APP_LIMIT, limitMessage } from "@/lib/app-limit";
import { V_STORE } from "@/lib/constants";
import { getMyAppLimit, getPromotion, getViewer } from "@/lib/data";
import { isSupabaseConfigured } from "@/lib/supabase/env";

import { SubmitForm } from "./SubmitForm";

// Checking a link can take up to 15 seconds (sleeping sites wake up slowly).
export const maxDuration = 60;

export const metadata: Metadata = { title: "Post a Drop" };

export default async function SubmitPage() {
  const viewer = await getViewer();
  if (isSupabaseConfigured && !viewer) redirect("/login?next=/submit");
  const limit = await getMyAppLimit(viewer);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="display rise text-6xl sm:text-7xl">Post a Drop</h1>
      <p className="mt-1 text-muted">
        Show off what you built in 60 seconds: the problem, the wow moment and where to click. Then real people try it and tell you what
        they think.
      </p>
      <p className="mt-1 text-sm">
        <Link href="/ask" className="font-semibold text-accent hover:underline">
          Or ask a question about your app →
        </Link>
      </p>
      {!isSupabaseConfigured && (
        <p className="mt-4 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-muted">
          You&apos;re in demo mode, so posting is off. You can still fill the form in to see how it works.{" "}
          <Link href="/" className="underline">
            Back to Home
          </Link>
        </p>
      )}
      <DropBonusBanner promo={await getPromotion("drop_bonus")} className="mt-4" />
      {limit.nextAt ? (
        // At the limit: say when the next one opens, and what they can do now.
        <section aria-label="App limit" className="mt-6 rounded-xl border border-accent/60 bg-accent/10 p-5">
          <h2 className="display text-4xl">You&apos;ve posted {APP_LIMIT.perWindow} apps this month</h2>
          <p className="mt-1 text-sm">{limitMessage(limit.nextAt)}</p>
          <p className="mt-3 flex flex-wrap gap-2">
            <Link href="/store" className="btn-accent">
              Get an extra post · <Coin />
              {V_STORE.appPost.cost}
            </Link>
            <Link href={viewer ? `/u/${viewer.username}` : "/"} className="btn-ghost">
              Add a Drop to one of your apps
            </Link>
            <Link href="/test" className="btn-ghost">
              Test apps and earn Methodium
            </Link>
          </p>
        </section>
      ) : (
        <>
          <p className="mt-4 text-xs text-muted">
            You can post {APP_LIMIT.perWindow} new apps every {APP_LIMIT.days} days ({limit.left} left), so every app gets seen. New Drops on
            apps you&apos;ve already posted don&apos;t count.
          </p>
          <SubmitForm userId={viewer?.id ?? null} />
        </>
      )}
    </div>
  );
}
