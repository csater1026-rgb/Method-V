import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppCard } from "@/components/AppCard";
import { Avatar } from "@/components/Avatar";
import { ConnectButton } from "@/components/ConnectButton";
import { FollowButton } from "@/components/FollowButton";
import { PassportCard } from "@/components/Passport";
import { Updates } from "@/components/Updates";
import { Chip, RoleTags, StatusBadge, primaryStatus } from "@/components/Tags";
import { getConnectionState, getMyApps, getPassport, getProfile, getUpdates, getViewer, isPro } from "@/lib/data";
import { formatCount } from "@/lib/format";
import { publicFileUrl } from "@/lib/supabase/env";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function ProfilePage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const [result, viewer] = await Promise.all([getProfile(username.toLowerCase()), getViewer()]);
  if (!result) notFound();
  const { profile, apps, isFollowing } = result;
  const isSelf = viewer?.id === profile.id;
  const pro = isPro(profile);
  // Pro builders can pin one app to the front.
  const pinnedId = pro ? profile.pinned_app_id : null;
  const orderedApps = pinnedId ? [...apps].sort((a, b) => Number(b.id === pinnedId) - Number(a.id === pinnedId)) : apps;
  const [passport, updates, myApps, connection] = await Promise.all([
    getPassport(profile.id),
    getUpdates({ userId: profile.id, limit: 20 }),
    isSelf ? getMyApps(viewer) : Promise.resolve([]),
    getConnectionState(viewer, profile.id),
  ]);

  const links = [
    profile.website_url && { href: profile.website_url, label: hostnameOf(profile.website_url) },
    profile.x_handle && { href: `https://x.com/${profile.x_handle}`, label: `X @${profile.x_handle}` },
    profile.github_handle && { href: `https://github.com/${profile.github_handle}`, label: `GitHub ${profile.github_handle}` },
    profile.linkedin_url && { href: profile.linkedin_url, label: "LinkedIn" },
  ].filter((l): l is { href: string; label: string } => Boolean(l));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <section className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {/* Photo with the status people message about right under it. */}
        <div className="flex shrink-0 flex-col items-start gap-2 sm:items-center">
          <Avatar username={profile.username} name={profile.display_name} src={publicFileUrl(profile.avatar_path ?? null)} size={96} />
          <StatusBadge roles={profile.roles} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h1 className="display text-6xl break-words">
                {profile.display_name || `@${profile.username}`}
                {pro && (
                  <span className="tag-accent ml-3 align-middle text-xs" title="Method V Pro">
                    Pro
                  </span>
                )}
              </h1>
              <p className="text-muted">@{profile.username}</p>
            </div>
            <div className="sm:ml-auto">
              {isSelf ? (
                <span className="flex flex-wrap gap-2">
                  <Link href="/settings" className="btn-ghost">
                    Edit profile
                  </Link>
                  <Link href="/swaps" className="btn-ghost">
                    Swaps
                  </Link>
                  <Link href="/dashboard" className="btn-ghost">
                    Stats
                  </Link>
                  <Link href="/earn" className="btn-ghost">
                    Earn
                  </Link>
                </span>
              ) : (
                <span className="flex flex-wrap items-start gap-2">
                  <FollowButton profileId={profile.id} initialFollowing={isFollowing} signedIn={Boolean(viewer)} />
                  <ConnectButton
                    profileId={profile.id}
                    username={profile.username}
                    initial={connection}
                    signedIn={Boolean(viewer)}
                  />
                </span>
              )}
            </div>
          </div>

          <RoleTags roles={profile.roles} except={primaryStatus(profile.roles)} />
          {profile.bio && <p className="max-w-2xl whitespace-pre-line text-ink/90">{profile.bio}</p>}

          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span>
              <strong className="text-ink">{formatCount(profile.follower_count)}</strong> followers
            </span>
            <span>
              <strong className="text-ink">{formatCount(profile.following_count)}</strong> following
            </span>
            <span>
              <strong className="text-ink">{formatCount(profile.connection_count)}</strong>{" "}
              {profile.connection_count === 1 ? "connection" : "connections"}
            </span>
            <span>
              <strong className="text-ink">{apps.length}</strong> {apps.length === 1 ? "app" : "apps"}
            </span>
            <span title="Earned from upvoted and best answers in Q&A">
              <strong className="text-ink">{formatCount(profile.reputation)}</strong> reputation
            </span>
            <span title="Feedback this builder has given, and how much of it builders marked helpful">
              <strong className="text-ink">{formatCount(profile.feedback_given_count)}</strong> feedback given
              {profile.feedback_helpful_count > 0 && (
                <>
                  {" · "}
                  <strong className="text-accent">{formatCount(profile.feedback_helpful_count)}</strong> helpful
                </>
              )}
            </span>
          </p>

          {profile.skills.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {profile.skills.map((s) => (
                <Chip key={s}>{s}</Chip>
              ))}
            </div>
          )}

          {links.length > 0 && (
            <ul className="flex flex-wrap gap-3 text-sm">
              {links.map((l) => (
                <li key={l.href}>
                  <a href={l.href} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline">
                    {l.label} ↗
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="mt-8">
        <PassportCard profile={profile} passport={passport} isSelf={isSelf} />
      </div>

      <section aria-label="Updates" className="mt-12">
        <h2 className="display text-4xl">Updates</h2>
        <div className="mt-3">
          <Updates
            updates={updates}
            viewerId={viewer?.id ?? null}
            composer={isSelf ? { apps: myApps } : null}
            emptyText={isSelf ? "Share your first update." : "No updates yet."}
          />
        </div>
      </section>

      <h2 className="display mt-12 text-4xl">Apps</h2>
      {apps.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {orderedApps.map((app, i) => (
            <div key={app.id} className="relative">
              {app.id === pinnedId && <span className="tag-accent absolute top-2 right-2 z-10">Pinned</span>}
              <AppCard app={app} showOwner={false} index={i} />
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-muted">
          {isSelf ? (
            <>
              Nothing posted yet.{" "}
              <Link href="/submit" className="text-accent hover:underline">
                Post your first Drop
              </Link>
            </>
          ) : (
            "No apps posted yet."
          )}
        </p>
      )}
    </div>
  );
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Website";
  }
}
