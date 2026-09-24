import Link from "next/link";

import type { AppCard } from "@/lib/types";

import { Avatar } from "./Avatar";
import { Countdown } from "./Countdown";

// "Launching soon": apps with a launch date coming up, with a countdown.
export function UpcomingLaunches({ apps }: { apps: AppCard[] }) {
  if (apps.length === 0) return null;
  return (
    <section aria-label="Upcoming launches" className="mt-6">
      <h2 className="display text-3xl">Launching soon</h2>
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-surface">
        {apps.map((app) => (
          <li key={app.id}>
            <Link href={`/apps/${app.slug}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2">
              <Avatar username={app.owner.username} name={app.owner.display_name} src={app.owner.avatar_url} size={32} />
              <span className="min-w-0 flex-1">
                <span className="display block truncate text-2xl">{app.name}</span>
                <span className="block truncate text-xs text-muted">{app.tagline}</span>
              </span>
              <span className="text-right">
                <span className="block font-mono text-[10px] tracking-wide text-muted uppercase">Launches in</span>
                <Countdown to={app.launch_at!} className="font-mono text-sm font-bold text-accent" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
