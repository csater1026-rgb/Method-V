import Link from "next/link";

import { CATEGORIES, labelFor } from "@/lib/constants";
import type { Suggestion } from "@/lib/types";

import { Avatar } from "./Avatar";
import { FollowButton } from "./FollowButton";
import { RoleTags } from "./Tags";

// "Builders like you": people who build in the categories you build, like and
// test, or share your skills, topped up with the newest builders.
export function Suggestions({ people, signedIn }: { people: Suggestion[]; signedIn: boolean }) {
  if (people.length === 0) return null;
  return (
    <section aria-label="Builders like you" className="mt-8">
      <h2 className="display px-4 text-3xl">Builders like you</h2>
      <ul className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2">
        {people.map((p, i) => {
          const shared = [...p.shared_categories.map((c) => labelFor(CATEGORIES, c)), ...p.shared_skills];
          return (
            <li
              key={p.id}
              className="rise flex w-60 shrink-0 snap-start flex-col gap-2 rounded-xl border border-line bg-surface p-4"
              style={{ "--i": i } as React.CSSProperties}
            >
              <Link href={`/u/${p.username}`} className="flex items-center gap-3">
                <Avatar username={p.username} name={p.display_name} src={p.avatar_url} size={44} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.display_name || `@${p.username}`}</span>
                  <span className="block truncate text-xs text-muted">@{p.username}</span>
                </span>
              </Link>
              <RoleTags roles={p.roles} />
              {shared.length > 0 ? (
                <p className="text-xs text-muted">
                  In common: <span className="text-ink">{shared.slice(0, 3).join(" · ")}</span>
                </p>
              ) : (
                <p className="text-xs text-muted">New on Method V</p>
              )}
              <div className="mt-auto pt-1">
                <FollowButton profileId={p.id} initialFollowing={false} signedIn={signedIn} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
