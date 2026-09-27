import Link from "next/link";

import { FOLLOW_LIST_MAX, getViewer, type FollowList as List } from "@/lib/data";
import { formatCount } from "@/lib/format";

import { Avatar } from "./Avatar";
import { FollowButton } from "./FollowButton";
import { Handle } from "./Handle";
import { StatusBadge } from "./Tags";

// Someone's followers, or who they follow: /u/<name>/followers and
// /u/<name>/following, from the counts on their profile.
export async function FollowList({ list, kind }: { list: List; kind: "followers" | "following" }) {
  const viewer = await getViewer();
  const { owner, people, viewerFollows, total } = list;
  const name = owner.display_name || `@${owner.username}`;
  const tab = (k: "followers" | "following", label: string) => (
    <Link
      href={`/u/${owner.username}/${k}`}
      aria-current={k === kind ? "page" : undefined}
      className={`flex-1 rounded-md py-2 text-center text-sm font-semibold ${k === kind ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <Link href={`/u/${owner.username}`} className="text-sm text-muted hover:text-ink">
        ← {name}
      </Link>
      <h1 className="display rise mt-1 text-5xl break-words">{kind === "followers" ? `${name}'s followers` : `${name} follows`}</h1>
      <nav aria-label="Followers or following" className="mt-4 flex rounded-lg border border-line p-1">
        {tab("followers", "Followers")}
        {tab("following", "Following")}
      </nav>

      {people.length === 0 ? (
        <p className="mt-8 text-center text-muted">
          {kind === "followers" ? "No followers yet." : "Not following anyone yet."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line bg-surface">
          {people.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <Link href={`/u/${p.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar username={p.username} name={p.display_name} src={p.avatar_url ?? null} size={44} />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{p.display_name || <Handle username={p.username} />}</span>
                  <span className="block truncate text-sm text-muted">
                    <Handle username={p.username} />
                  </span>
                </span>
              </Link>
              <span className="hidden sm:block">
                <StatusBadge roles={p.roles} />
              </span>
              {viewer?.id !== p.id && <FollowButton profileId={p.id} initialFollowing={viewerFollows.has(p.id)} signedIn={Boolean(viewer)} />}
            </li>
          ))}
        </ul>
      )}
      {total > people.length && (
        <p className="mt-3 text-center text-sm text-muted">
          Showing the newest {formatCount(Math.min(people.length, FOLLOW_LIST_MAX))} of {formatCount(total)}.
        </p>
      )}
    </div>
  );
}
