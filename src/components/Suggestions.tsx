import Link from "next/link";

import { CATEGORIES, ROLES, labelFor, primaryStatus } from "@/lib/constants";
import type { Suggestion } from "@/lib/types";

import { Avatar } from "./Avatar";
import { FollowButton } from "./FollowButton";
import { Handle } from "./Handle";

// On phones only the first few show (2 rows of 2), so Home stays short.
const PHONE_COUNT = 4;

// "Builders like you": people who build in the categories you build, like and
// test, or share your skills, topped up with the newest builders. Square
// tiles: photo, name, @handle and status, what you have in common, and a
// Follow button across the bottom. 4 per row on computers, 2 on phones.
export function Suggestions({ people, signedIn }: { people: Suggestion[]; signedIn: boolean }) {
  if (people.length === 0) return null;
  return (
    <section aria-label="Builders like you" className="mt-8">
      <h2 className="display px-4 text-3xl">Builders like you</h2>
      <ul className="mt-3 grid grid-cols-2 gap-3 px-4 lg:grid-cols-4">
        {people.map((p, i) => {
          const shared = [...p.shared_categories.map((c) => labelFor(CATEGORIES, c)), ...p.shared_skills];
          // Their status (hiring, looking for work…), or else their first role.
          const status = primaryStatus(p.roles);
          const role = status ?? p.roles[0];
          return (
            <li
              key={p.id}
              className={`rise group aspect-square min-w-0 flex-col items-center justify-center gap-1.5 rounded-2xl border border-line bg-surface p-3.5 text-center transition hover:border-accent/60 sm:p-4 ${
                i < PHONE_COUNT ? "flex" : "hidden sm:flex"
              }`}
              style={{ "--i": i } as React.CSSProperties}
            >
              <Link href={`/u/${p.username}`} className="flex w-full min-w-0 flex-col items-center gap-1.5">
                <span className="rounded-full ring-2 ring-line transition group-hover:ring-accent/60">
                  <Avatar username={p.username} name={p.display_name} src={p.avatar_url} size={56} />
                </span>
                <span className="mt-1 block w-full truncate font-semibold">{p.display_name || <Handle username={p.username} />}</span>
                <span className="block w-full truncate text-xs text-muted">
                  <Handle username={p.username} />
                  {role && (
                    <>
                      {" · "}
                      <span className={status ? "font-medium text-accent" : ""}>{labelFor(ROLES, role)}</span>
                    </>
                  )}
                </span>
                <span className="block w-full truncate text-xs text-muted">
                  {shared.length > 0 ? (
                    <>
                      <span className="sr-only">In common: </span>
                      {shared.slice(0, 2).join(" · ")}
                    </>
                  ) : (
                    "New on Method V"
                  )}
                </span>
              </Link>
              <div className="mt-1.5 w-full">
                <FollowButton profileId={p.id} initialFollowing={false} signedIn={signedIn} small full />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
