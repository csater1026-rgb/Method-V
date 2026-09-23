import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppCard } from "@/components/AppCard";
import { Avatar } from "@/components/Avatar";
import { FollowButton } from "@/components/FollowButton";
import { Chip, RoleTags } from "@/components/Tags";
import { getProfile, getViewer } from "@/lib/data";
import { formatCount } from "@/lib/format";

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

  const links = [
    profile.website_url && { href: profile.website_url, label: hostnameOf(profile.website_url) },
    profile.x_handle && { href: `https://x.com/${profile.x_handle}`, label: `X @${profile.x_handle}` },
    profile.github_handle && { href: `https://github.com/${profile.github_handle}`, label: `GitHub ${profile.github_handle}` },
    profile.linkedin_url && { href: profile.linkedin_url, label: "LinkedIn" },
  ].filter((l): l is { href: string; label: string } => Boolean(l));

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8">
      <section className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <Avatar username={profile.username} name={profile.display_name} size={96} />
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h1 className="display text-6xl break-words">{profile.display_name || `@${profile.username}`}</h1>
              <p className="text-muted">@{profile.username}</p>
            </div>
            <div className="sm:ml-auto">
              {isSelf ? (
                <Link href="/settings" className="btn-ghost">
                  Edit profile
                </Link>
              ) : (
                <FollowButton profileId={profile.id} initialFollowing={isFollowing} signedIn={Boolean(viewer)} />
              )}
            </div>
          </div>

          <RoleTags roles={profile.roles} />
          {profile.bio && <p className="max-w-2xl whitespace-pre-line text-ink/90">{profile.bio}</p>}

          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
            <span>
              <strong className="text-ink">{formatCount(profile.follower_count)}</strong> followers
            </span>
            <span>
              <strong className="text-ink">{formatCount(profile.following_count)}</strong> following
            </span>
            <span>
              <strong className="text-ink">{apps.length}</strong> {apps.length === 1 ? "app" : "apps"}
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

      <h2 className="display mt-12 text-4xl">Apps</h2>
      {apps.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((app, i) => (
            <AppCard key={app.id} app={app} showOwner={false} index={i} />
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
