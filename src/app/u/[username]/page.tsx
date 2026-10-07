import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FeaturedCard } from "@/components/FeaturedCard";
import { Avatar } from "@/components/Avatar";
import { ConnectButton } from "@/components/ConnectButton";
import { FollowButton } from "@/components/FollowButton";
import { PassportCard } from "@/components/Passport";
import { ProfileDrops } from "@/components/ProfileDrops";
import { Updates } from "@/components/Updates";
import { Chip, RoleTags, StatusBadge, primaryStatus } from "@/components/Tags";
import { SignOutButton } from "@/components/SignOutButton";
import { getConnectionState, getMyApps, getPassport, getProfile, getProfileDrops, getUpdates, getViewer, isPro } from "@/lib/data";
import { formatCount } from "@/lib/format";
import { socialLinks } from "@/lib/socials";
import { publicFileUrl } from "@/lib/supabase/env";
import { Handle } from "@/components/Handle";
import { isDefaultUsername } from "@/lib/username";

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
  const [passport, updates, myApps, connection, drops] = await Promise.all([
    getPassport(profile.id),
    getUpdates({ userId: profile.id, limit: 20 }),
    isSelf ? getMyApps(viewer) : Promise.resolve([]),
    getConnectionState(viewer, profile.id),
    getProfileDrops(profile.id),
  ]);

  const links = socialLinks(profile);
  const cover = publicFileUrl(profile.cover_path ?? null);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      {isSelf && isDefaultUsername(profile.username) && (
        <Link
          href="/welcome"
          className="mb-6 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent/60 bg-surface px-4 py-3 text-sm transition hover:border-accent"
        >
          <span>
            <strong>Pick your username.</strong> <span className="text-muted">People see you as @{profile.username} until you do.</span>
          </span>
          <span className="font-semibold text-accent">Choose one →</span>
        </Link>
      )}
      {/* Their header picture, behind their photo: only on this page. */}
      {cover ? (
        <div className="aspect-[3/1] max-h-64 w-full overflow-hidden rounded-xl border border-line bg-surface-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cover} alt="" className="h-full w-full object-cover" />
        </div>
      ) : (
        isSelf && (
          <Link
            href="/settings#cover"
            className="mb-6 flex h-20 w-full items-center justify-center rounded-xl border border-dashed border-line text-sm text-muted transition hover:border-accent hover:text-ink"
          >
            + Add a header picture
          </Link>
        )
      )}
      <section className={`flex flex-col gap-6 sm:flex-row sm:items-start ${cover ? "px-2 sm:px-6" : ""}`}>
        {/* Photo with the status people message about right under it. */}
        <div className={`flex shrink-0 flex-col items-start gap-2 sm:items-center ${cover ? "relative -mt-12 sm:-mt-14" : ""}`}>
          <span className={cover ? "rounded-full bg-bg p-1" : ""}>
            <Avatar username={profile.username} name={profile.display_name} src={publicFileUrl(profile.avatar_path ?? null)} size={96} />
          </span>
          <StatusBadge roles={profile.roles} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h1 className="display text-6xl break-words">
                {profile.display_name || <Handle username={profile.username} />}
                {pro && (
                  <span className="tag-accent ml-3 align-middle text-xs" title="Method V Pro">
                    Pro
                  </span>
                )}
              </h1>
              <p className="text-muted"><Handle username={profile.username} /></p>
              {/* Their socials, right under their name. */}
              {links.length > 0 ? (
                <ul aria-label="Social links" className="mt-2 flex flex-wrap gap-1.5">
                  {links.map((l) => (
                    <li key={l.key}>
                      <a
                        href={l.href}
                        target="_blank"
                        rel="noopener noreferrer nofollow me"
                        className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-xs transition hover:border-accent"
                      >
                        <span className="font-semibold">{l.label}</span>
                        {l.text !== l.label && <span className="text-muted">{l.text}</span>}
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                isSelf && (
                  <Link href="/settings#socials" className="mt-2 inline-block text-sm text-accent hover:underline">
                    + Add your social handles
                  </Link>
                )
              )}
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
                  <Link href="/store#earnings" className="btn-ghost">
                    Earn
                  </Link>
                  <SignOutButton />
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
            <Link href={`/u/${profile.username}/followers`} className="hover:text-ink hover:underline">
              <strong className="text-ink">{formatCount(profile.follower_count)}</strong> followers
            </Link>
            <Link href={`/u/${profile.username}/following`} className="hover:text-ink hover:underline">
              <strong className="text-ink">{formatCount(profile.following_count)}</strong> following
            </Link>
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

        </div>
      </section>

      {/* What they've made comes first: their Drops, then their apps. */}
      <section aria-labelledby="profile-drops" className="mt-10">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="profile-drops" className="display text-4xl">
            Drops <span className="text-2xl text-muted">{drops.length}</span>
          </h2>
          {drops.length > 0 && (
            <Link href="/drops" className="text-sm text-accent hover:underline">
              Watch all Drops →
            </Link>
          )}
        </div>
        {drops.length === 0 && !isSelf ? (
          <p className="mt-3 text-muted">No Drops yet.</p>
        ) : (
          <ProfileDrops drops={drops} isSelf={isSelf} />
        )}
      </section>

      <section aria-labelledby="profile-apps" className="mt-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="profile-apps" className="display text-4xl">
            {isSelf ? "Your apps" : "Apps"} <span className="text-2xl text-muted">{apps.length}</span>
          </h2>
          {isSelf && apps.length > 0 && <p className="text-sm text-muted">Edit, add Drops, reply to feedback or delete from each app&apos;s Manage page.</p>}
        </div>
        {apps.length > 0 ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {orderedApps.map((app, i) => (
              <div key={app.id} className="relative flex flex-col gap-2">
                {app.id === pinnedId && <span className="tag-accent absolute top-2 right-2 z-10">Pinned</span>}
                <FeaturedCard app={app} rank={i} fill showOwner={false} />
                {isSelf && (
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/apps/${app.slug}/manage`} className="btn-accent flex-1 px-3 py-1.5 text-center text-sm">
                      ✎ Manage
                    </Link>
                    <Link href={`/apps/${app.slug}#feedback`} className="btn-ghost px-3 py-1.5 text-sm">
                      Feedback{app.feedback_count > 0 ? ` · ${formatCount(app.feedback_count)}` : ""}
                    </Link>
                    <Link href={`/dashboard?app=${app.slug}`} className="btn-ghost px-3 py-1.5 text-sm">
                      Stats
                    </Link>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-muted">
            {isSelf ? (
              <>
                Nothing posted yet.{" "}
                <Link href="/submit" className="text-accent hover:underline">
                  Post your first app
                </Link>
              </>
            ) : (
              "No apps posted yet."
            )}
          </p>
        )}
      </section>

      <div className="mt-12">
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
    </div>
  );
}
