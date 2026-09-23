import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CREDITS, CREDIT_REASONS } from "@/lib/constants";
import { getCreditHistory, getViewer } from "@/lib/data";
import { timeAgo } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Credits" };

export default async function CreditsPage() {
  const viewer = await getViewer();
  if (isSupabaseConfigured && !viewer) redirect("/login?next=/credits");
  const history = viewer ? await getCreditHistory(viewer) : [];

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="text-3xl font-black tracking-tight">Credits</h1>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface p-5">
        <div>
          <p className="text-sm text-muted">Your balance</p>
          <p className="text-4xl font-black">⚡{viewer?.credits ?? 0}</p>
        </div>
        <Link href="/test" className="btn-accent">
          Earn more in Test &amp; earn
        </Link>
      </div>

      <h2 className="mt-8 text-lg font-bold">How credits work</h2>
      <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink/90">
        <li>• Everyone starts with ⚡{CREDITS.welcome}.</li>
        <li>
          • Try an app in <Link href="/test" className="text-accent hover:underline">Test &amp; earn</Link> and give feedback:
          earn ⚡{CREDITS.feedbackReward}.
        </li>
        <li>• When a builder marks your feedback helpful: +⚡{CREDITS.helpfulBonus}.</li>
        <li>• Spend ⚡{CREDITS.perTester} per tester to put your own app in the queue. Unused spots are refunded if you stop.</li>
        <li>• You can earn from up to {CREDITS.dailyPaidFeedback} feedbacks a day, so the queue stays fair.</li>
      </ul>

      {!isSupabaseConfigured && <p className="mt-6 text-sm text-muted">Credits are off in demo mode.</p>}

      {viewer && (
        <>
          <h2 className="mt-8 text-lg font-bold">History</h2>
          {history.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing yet.</p>
          ) : (
            <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface">
              {history.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{CREDIT_REASONS[e.reason] ?? e.reason}</p>
                    <p className="truncate text-xs text-muted">
                      {e.app && (
                        <>
                          <Link href={`/apps/${e.app.slug}`} className="hover:text-ink">
                            {e.app.name}
                          </Link>{" "}
                          ·{" "}
                        </>
                      )}
                      {timeAgo(e.created_at)}
                    </p>
                  </div>
                  <span className={`font-mono font-semibold ${e.delta > 0 ? "text-accent" : "text-muted"}`}>
                    {e.delta > 0 ? "+" : ""}
                    {e.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
