import Link from "next/link";

import { timeAgo } from "@/lib/format";
import type { Backer } from "@/lib/types";

import { Avatar } from "./Avatar";

// The backers wall: who backed this app and what they said. Never amounts.
export function Backers({ backers, count, appName }: { backers: Backer[]; count: number; appName: string }) {
  return (
    <section id="backers" aria-label="Backers" className="scroll-mt-20">
      <h2 className="display text-4xl">
        Backers <span className="font-mono text-base text-muted">{count}</span>
      </h2>
      {backers.length === 0 ? (
        <p className="mt-1 text-sm text-muted">No one has backed {appName} yet. Be the first.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {backers.map((b) => (
            <li key={b.id} className="flex items-start gap-3 rounded-lg border border-line bg-surface p-3">
              <Link href={`/u/${b.user.username}`}>
                <Avatar username={b.user.username} name={b.user.display_name} src={b.user.avatar_url} size={32} />
              </Link>
              <div className="min-w-0 text-sm">
                <Link href={`/u/${b.user.username}`} className="font-semibold hover:underline">
                  {b.user.display_name || `@${b.user.username}`}
                </Link>{" "}
                <span className="text-muted" suppressHydrationWarning>
                  backed it · {timeAgo(b.created_at)}
                </span>
                {b.note && <p className="mt-0.5 text-ink/85">“{b.note}”</p>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
