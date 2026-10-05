import Link from "next/link";

import { CATEGORIES, ROLES, labelFor, primaryStatus } from "@/lib/constants";
import type { Suggestion } from "@/lib/types";

import { Avatar } from "./Avatar";
import { FollowButton } from "./FollowButton";
import { Handle } from "./Handle";

// "Builders like you": people who build in the categories you build, like and
// test, or share your skills, topped up with the newest builders. Compact
// rows (photo, name, @handle and status, what you have in common, Follow on
// the right):
// a grid on computers, a sideways swipe on phones.
export function Suggestions({
  people,
  signedIn,
}: {
  people: Suggestion[];
  signedIn: boolean;
}) {
  if (people.length === 0) return null;
  return (
    <section aria-label="Builders like you" className="mt-8">
      <h2 className="display px-4 text-3xl">Builders like you</h2>
      <ul className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-px-4 px-4 pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible lg:grid-cols-3">
        {people.map((p, i) => {
          const shared = [
            ...p.shared_categories.map((c) => labelFor(CATEGORIES, c)),
            ...p.shared_skills,
          ];
          // Their status (hiring, looking for work…), or else their first role.
          const status = primaryStatus(p.roles);
          const role = status ?? p.roles[0];
          return (
            <li
              key={p.id}
              className="rise group flex w-[85vw] max-w-sm shrink-0 snap-start items-center gap-3.5 rounded-2xl border border-line bg-surface px-4 py-3.5 transition hover:border-accent/60 sm:w-auto sm:max-w-none"
              style={{ "--i": i } as React.CSSProperties}
            >
              <Link
                href={`/u/${p.username}`}
                className="flex min-w-0 flex-1 items-center gap-3.5"
              >
                <span className="shrink-0 rounded-full ring-2 ring-line transition group-hover:ring-accent/60">
                  <Avatar
                    username={p.username}
                    name={p.display_name}
                    src={p.avatar_url}
                    size={48}
                  />
                </span>
                <span className="min-w-0 flex-1 leading-tight">
                  <span className="block truncate font-semibold">
                    {p.display_name || <Handle username={p.username} />}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted">
                    <Handle username={p.username} />
                    {role && (
                      <>
                        {" · "}
                        <span
                          className={status ? "font-medium text-accent" : ""}
                        >
                          {labelFor(ROLES, role)}
                        </span>
                      </>
                    )}
                  </span>
                  <span className="mt-1.5 block truncate text-xs text-muted">
                    {shared.length > 0 ? (
                      <>
                        In common:{" "}
                        <span className="text-ink">
                          {shared.slice(0, 3).join(" · ")}
                        </span>
                      </>
                    ) : (
                      "New on Method V"
                    )}
                  </span>
                </span>
              </Link>
              <FollowButton
                profileId={p.id}
                initialFollowing={false}
                signedIn={signedIn}
                small
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
