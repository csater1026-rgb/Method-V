import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { Avatar } from "@/components/Avatar";
import { Backers } from "@/components/Backers";
import { BackButton, SponsorOffer } from "@/components/Earn";
import { SponsoredBy } from "@/components/Sponsored";
import { Comments } from "@/components/Comments";
import { Countdown } from "@/components/Countdown";
import { DropPlaceholder } from "@/components/DropVideo";
import { FeedbackPanel } from "@/components/FeedbackPanel";
import { FollowButton } from "@/components/FollowButton";
import { QandA } from "@/components/QandA";
import { GrowPanel } from "@/components/GrowPanel";
import { Updates } from "@/components/Updates";
import { LikeButton } from "@/components/LikeButton";
import { ShareButton } from "@/components/ShareButton";
import { ShareKit } from "@/components/ShareKit";
import { TeamUp } from "@/components/Swaps";
import { CategoryChip, Chip, PricingStage, RoleTags, StatusBadge, primaryStatus } from "@/components/Tags";
import {
  appStatus,
  getApp,
  getBackers,
  getMyBrands,
  getComments,
  getFeedbackPanel,
  getMyApps,
  getQuestions,
  getSwapPartners,
  getUpdates,
  getViewer,
  isFollowing,
} from "@/lib/data";
import { formatCount, formatDuration, timeAgo } from "@/lib/format";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata({ params }: PageProps<"/apps/[slug]">): Promise<Metadata> {
  const app = await getApp((await params).slug);
  return app ? { title: app.name, description: app.tagline } : { title: "App not found" };
}

export default async function AppPage({ params, searchParams }: PageProps<"/apps/[slug]">) {
  const { slug } = await params;
  const { posted, tab: tabParam } = await searchParams;
  const tab = tabParam === "qa" || tabParam === "updates" ? tabParam : "comments";
  const [app, viewer] = await Promise.all([getApp(slug), getViewer()]);
  if (!app) notFound();

  const [comments, following, feedbackPanel, updates, partners, myApps, questions, backers, myBrands] = await Promise.all([
    app.drop ? getComments(app.drop.id) : [],
    isFollowing(viewer, app.owner_id),
    getFeedbackPanel(app, viewer),
    getUpdates({ appId: app.id, limit: 10 }),
    getSwapPartners(app.id),
    viewer && viewer.id !== app.owner_id ? getMyApps(viewer) : Promise.resolve([]),
    getQuestions(app.id, viewer),
    getBackers(app.id),
    viewer && viewer.id !== app.owner_id ? getMyBrands(viewer) : Promise.resolve([]),
  ]);
  // You can sponsor with one of your apps or a verified brand.
  const sponsors = [
    ...myApps.map((a) => ({ id: a.id, name: a.name, kind: "app" as const })),
    ...myBrands.filter((b) => b.verified && b.live).map((b) => ({ id: b.id, name: b.name, kind: "brand" as const })),
  ];
  const wouldUse = app.feedback_count ? Math.round((app.would_use_yes_count / app.feedback_count) * 100) : null;
  const rating = app.feedback_count ? (app.rating_sum / app.feedback_count).toFixed(1) : null;
  const isOwner = viewer?.id === app.owner_id;
  const status = appStatus(app);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 lg:grid-cols-[minmax(0,360px)_1fr]">
      <div className="mx-auto w-full max-w-[360px]">
        <div className="media-dark relative aspect-[9/16] overflow-hidden rounded-xl border border-line bg-surface">
          {app.drop?.video_url ? (
            <video
              src={app.drop.video_url}
              poster={app.drop.poster_url ?? undefined}
              controls
              playsInline
              preload="metadata"
              className="h-full w-full bg-black object-contain"
            />
          ) : (
            <DropPlaceholder name={app.name} category={app.category} />
          )}
          {app.drop && (
            <span className="absolute top-3 right-3 rounded-md bg-black/55 px-2 py-0.5 font-mono text-[11px] backdrop-blur">
              {formatDuration(app.drop.duration_seconds)}
            </span>
          )}
        </div>
        {app.drop?.caption && <p className="mt-3 text-sm text-ink/85">{app.drop.caption}</p>}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        {posted && isOwner && (
          <p className="rounded-xl border border-accent/40 bg-accent/10 px-4 py-3 text-sm">
            Your Drop is live. Share the link and watch the tries come in.
          </p>
        )}

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CategoryChip category={app.category} />
            <PricingStage pricing={app.pricing} stage={app.stage} />
            {status.launch === "live" && <span className="tag-accent">Launch day</span>}
            {status.launch === "upcoming" && (
              <span className="tag border-accent/60 text-accent">
                Launching in <Countdown to={app.launch_at!} />
              </span>
            )}
            {status.boostedUntil && <span className="tag-accent">Boosted</span>}
          </div>
          <h1 className="display mt-3 text-7xl break-words sm:text-8xl">{app.name}</h1>
          <p className="mt-1 text-lg text-muted">{app.tagline}</p>
          <p className="mt-1 text-sm text-muted">Posted {timeAgo(app.created_at)}</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a href={`/try/${app.slug}?via=page`} target="_blank" rel="noopener" className="btn-accent px-6 py-3 text-base">
            Try it →
          </a>
          {app.drop && (
            <LikeButton
              dropId={app.drop.id}
              initialLiked={app.liked}
              initialCount={app.drop.like_count}
              signedIn={Boolean(viewer)}
              layout="inline"
            />
          )}
          <ShareButton path={`/apps/${app.slug}`} title={`${app.name} on Method V`} layout="inline" />
          {!isOwner && <BackButton app={{ id: app.id, slug: app.slug, name: app.name }} signedIn={Boolean(viewer) || !isSupabaseConfigured} />}
        </div>

        {app.sponsor && <SponsoredBy sponsor={app.sponsor} />}

        <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <Stat label="Tries" value={formatCount(app.try_count)} />
          <Stat label="Likes" value={formatCount(app.like_count)} />
          <Stat
            label="Would use"
            value={wouldUse === null ? "—" : `${wouldUse}%`}
            note={`${formatCount(app.feedback_count)} ${app.feedback_count === 1 ? "tester" : "testers"}`}
          />
          <Stat label="Rating" value={rating === null ? "—" : `${rating}★`} note={rating === null ? "No feedback yet" : undefined} />
        </dl>

        {app.description && <p className="leading-relaxed whitespace-pre-line text-ink/90">{app.description}</p>}

        {/* Test & earn for this app, right under what it is. */}
        <FeedbackPanel panel={feedbackPanel} app={{ id: app.id, slug: app.slug, name: app.name }} />

        {app.tech_stack.length > 0 && (
          <div>
            <h2 className="mb-2 text-sm font-semibold text-muted">Built with</h2>
            <div className="flex flex-wrap gap-1.5">
              {app.tech_stack.map((s) => (
                <Link key={s} href={`/browse?stack=${encodeURIComponent(s)}`}>
                  <Chip>{s}</Chip>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4">
          <Link href={`/u/${app.owner.username}`} className="flex items-center gap-3">
            <Avatar username={app.owner.username} name={app.owner.display_name} src={app.owner.avatar_url} size={44} />
            <div>
              <span className="flex flex-wrap items-center gap-2 font-semibold">
                {app.owner.display_name || `@${app.owner.username}`}
                <StatusBadge roles={app.owner.roles} />
              </span>
              <span className="block text-sm text-muted">@{app.owner.username}</span>
              <RoleTags roles={app.owner.roles} except={primaryStatus(app.owner.roles)} className="mt-1" />
            </div>
          </Link>
          {!isOwner && (
            <FollowButton profileId={app.owner.id} initialFollowing={following} signedIn={Boolean(viewer)} />
          )}
        </div>

        {/* Builder tools. In demo mode everyone sees a preview so the features can be tried out. */}
        {((isOwner && viewer) || !isSupabaseConfigured) && (
          <GrowPanel
            app={{ id: app.id, slug: app.slug, name: app.name, launch_at: app.launch_at }}
            status={status}
            credits={viewer?.credits ?? 30}
            preview={!isSupabaseConfigured}
          >
            <ShareKit slug={app.slug} name={app.name} tagline={app.tagline} />
            <p className="mt-4 text-sm">
              <Link href="/swaps" className="text-accent hover:underline">
                Swaps &amp; co-launches →
              </Link>{" "}
              <span className="text-muted">Team up with other builders from their app pages.</span>
            </p>
            <p className="mt-2 text-sm">
              <Link href={`/dashboard?app=${app.slug}`} className="text-accent hover:underline">
                See stats →
              </Link>{" "}
              <span className="text-muted">Tries per day and where they come from.</span>
            </p>
          </GrowPanel>
        )}

        {(partners.friends.length > 0 || partners.colaunch.length > 0) && (
          <section aria-label="Friends of this app">
            <h2 className="display text-4xl">Friends of {app.name}</h2>
            <p className="mt-1 text-sm text-muted">
              {partners.colaunch.length > 0 && (
                <>Launching together with {partners.colaunch.map((a) => a.name).join(" and ")}. </>
              )}
              Apps {app.name}&apos;s builder recommends.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-3">
              {[...partners.friends, ...partners.colaunch].map((friend) => (
                <li key={friend.id}>
                  <Link
                    href={`/apps/${friend.slug}`}
                    className="flex h-full items-center gap-3 rounded-lg border border-line bg-surface p-3 hover:border-accent"
                  >
                    <Avatar username={friend.owner.username} name={friend.owner.display_name} src={friend.owner.avatar_url} size={32} />
                    <span className="min-w-0">
                      <span className="display block truncate text-2xl">{friend.name}</span>
                      <span className="block truncate text-xs text-muted">{friend.tagline}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {myApps.length > 0 && <TeamUp target={{ id: app.id, name: app.name }} myApps={myApps} />}

        {/* Boost Exchange, paid. In demo mode everyone sees it so it can be tried. */}
        {!isOwner && (sponsors.length > 0 || !isSupabaseConfigured) && (
          <SponsorOffer
            target={{ id: app.id, name: app.name }}
            myApps={sponsors.length > 0 ? sponsors : [{ id: "demo", name: "your app" }]}
          />
        )}

        <Backers backers={backers} count={app.backer_count} appName={app.name} />

        {/* Comments, Q&A and updates share one spot, one tab at a time. */}
        <section id="discuss" aria-label="Discussion" className="scroll-mt-20">
          <nav aria-label="Discussion" className="flex gap-5 border-b border-line">
            {(
              [
                ["comments", "Comments", comments.length],
                ["qa", "Q&A", questions.length],
                ["updates", "Updates", updates.length],
              ] as const
            ).map(([slug, label, count]) => (
              <Link
                key={slug}
                href={`/apps/${app.slug}${slug === "comments" ? "" : `?tab=${slug}`}#discuss`}
                scroll={false}
                aria-current={tab === slug ? "page" : undefined}
                className={`display pb-2 text-3xl ${
                  tab === slug ? "text-ink shadow-[inset_0_-3px_0_var(--color-accent)]" : "text-muted hover:text-ink"
                }`}
              >
                {label} <span className="font-mono text-sm text-muted">{count}</span>
              </Link>
            ))}
          </nav>
          <div className="mt-4">
            {tab === "comments" &&
              (app.drop ? (
                <Comments dropId={app.drop.id} appSlug={app.slug} comments={comments} viewerId={viewer?.id ?? null} bare />
              ) : (
                <p className="text-sm text-muted">Comments open once there&apos;s a Drop.</p>
              ))}
            {tab === "qa" && (
              <div id="qa" className="scroll-mt-20">
                <QandA
                  app={{ id: app.id, slug: app.slug, name: app.name, owner_id: app.owner_id }}
                  questions={questions}
                  viewerId={viewer?.id ?? null}
                />
              </div>
            )}
            {tab === "updates" && (
              <Updates
                updates={updates}
                viewerId={viewer?.id ?? null}
                composer={isOwner ? { apps: [{ id: app.id, name: app.name }], appId: app.id } : null}
                emptyText={`No updates on ${app.name} yet.`}
              />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-3 py-3">
      <dt className="font-mono text-[10px] tracking-wide text-muted uppercase">{label}</dt>
      <dd className="mt-1 font-mono text-xl font-bold">{value}</dd>
      {note && <dd className="mt-0.5 text-xs text-muted">{note}</dd>}
    </div>
  );
}
