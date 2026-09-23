import type { Metadata } from "next";
import Link from "next/link";

import { AppCard } from "@/components/AppCard";
import { CREDITS } from "@/lib/constants";
import { getTestQueue, getViewer } from "@/lib/data";

export const metadata: Metadata = {
  title: "Test & earn",
  description: "Try new apps, give honest feedback and earn credits to get testers for your own.",
};

export default async function TestPage() {
  const viewer = await getViewer();
  const queue = await getTestQueue(viewer);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <h1 className="display rise text-6xl sm:text-7xl">Test &amp; earn</h1>
      <p className="mt-1 max-w-2xl text-muted">
        These builders want real feedback. Try their app, tell them what worked and what didn&apos;t, and earn credits you
        can spend to get testers for your own app.
      </p>

      <ol className="mt-6 grid gap-3 sm:grid-cols-3">
        <Step n={1} title="Try it">
          Open an app below with <strong>Try it</strong> and use it for a minute.
        </Step>
        <Step n={2} title="Give feedback">
          Would you use it? What worked? What confused you? Only the builder sees it.
        </Step>
        <Step n={3} title={`Earn ⚡${CREDITS.feedbackReward}`}>
          Spend {CREDITS.perTester} credits per tester to put your own app in this queue. Helpful feedback earns a bonus.
        </Step>
      </ol>

      <div className="mt-8 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="display text-4xl">Waiting for testers</h2>
        {viewer ? (
          <Link href="/credits" className="text-sm text-muted hover:text-ink">
            You have <span className="font-semibold text-ink">⚡{viewer.credits}</span> · history
          </Link>
        ) : (
          <Link href="/login?next=/test" className="text-sm text-accent hover:underline">
            Sign in to earn credits
          </Link>
        )}
      </div>

      {queue.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {queue.map((app, i) => (
            <div key={app.id} className="flex flex-col gap-2">
              <AppCard app={app} index={i} />
              <div className="flex items-center justify-between gap-2 px-1 text-sm">
                <span className="font-mono text-xs font-semibold text-accent">
                  ⚡{CREDITS.feedbackReward} · {app.spots_left} {app.spots_left === 1 ? "spot" : "spots"} left
                </span>
                <Link href={`/apps/${app.slug}#feedback`} className="btn-ghost px-3 py-1.5">
                  Test it →
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <p className="text-lg font-semibold">Nobody&apos;s waiting for testers right now.</p>
          <p className="max-w-md text-muted">
            Want feedback on your app? Open it and use <strong>Get testers</strong> to put it here.
          </p>
          <Link href={viewer ? `/u/${viewer.username}` : "/submit"} className="btn-accent">
            {viewer ? "Go to your apps" : "Post a Drop"}
          </Link>
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="rise rounded-xl border border-line bg-surface p-4" style={{ "--i": n } as React.CSSProperties}>
      <span className="font-mono text-xs text-accent">0{n} /</span>
      <h3 className="display mt-2 text-3xl">{title}</h3>
      <p className="mt-1 text-sm text-muted">{children}</p>
    </li>
  );
}
