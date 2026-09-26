import Link from "next/link";

import { CATEGORIES, STREAK_BONUS, TESTER_RANKS, testerRank } from "@/lib/constants";
import { formatCount } from "@/lib/format";
import type { Passport as PassportData, Profile, TopBuilder, TopTester } from "@/lib/types";

import { Avatar } from "./Avatar";
import { Handle } from "./Handle";
import { Coin } from "./Coin";

// Short names for the rank ladder, so all five fit on a phone.
const LADDER: Record<string, string> = { new: "New", scout: "Scout", tester: "Tester", pro: "Pro", trusted: "Trusted" };

// Stamps sit at slightly different angles, like real ones.
const TILT = [-3, 2, -1.5, 2.5, -2, 1.5, -2.5, 2, -1, 3];

// The Tester Passport on a profile: where you are on the rank ladder, what the
// next rank needs, a stamp per category you've tested, and your streak.
export function PassportCard({ profile, passport, isSelf }: { profile: Profile; passport: PassportData; isSelf: boolean }) {
  const given = profile.feedback_given_count;
  const helpful = profile.feedback_helpful_count;
  const rankSlug = testerRank(given, helpful);
  const index = TESTER_RANKS.findIndex((r) => r.slug === rankSlug);
  const rank = TESTER_RANKS[index];
  const next = TESTER_RANKS[index + 1];
  const stamped = CATEGORIES.filter((c) => (passport.categories[c.slug] ?? 0) > 0);
  const toCollect = CATEGORIES.filter((c) => !(passport.categories[c.slug] ?? 0));

  return (
    <section aria-label="Tester Passport" className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex flex-col gap-5 p-4 sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div className="min-w-0">
          <p className="eyebrow">Tester Passport</p>
          <h2 className="display mt-1 text-5xl leading-none">{rank.label}</h2>
          <p className="mt-2 text-sm text-muted">{rank.perk}</p>
        </div>
        <dl className="grid shrink-0 grid-cols-3 divide-x divide-line rounded-lg border border-line bg-bg/40">
          <Stat value={given} label="Feedback" />
          <Stat value={helpful} label="Helpful" />
          <Stat value={passport.streak} label={passport.streak === 1 ? "Week streak" : "Wk streak"} />
        </dl>
      </div>

      {/* The rank ladder: every rank, filled up to yours. */}
      <ol aria-label="Ranks" className="grid grid-cols-5 gap-1.5 px-4 sm:px-5">
        {TESTER_RANKS.map((r, i) => (
          <li key={r.slug} aria-current={i === index ? "step" : undefined}>
            <div className={`h-1.5 rounded-full ${i <= index ? "bg-accent" : "bg-surface-2"}`} />
            <p className={`mt-1.5 truncate text-[11px] ${i === index ? "font-semibold text-ink" : i < index ? "text-ink/70" : "text-muted"}`}>
              {LADDER[r.slug]}
            </p>
          </li>
        ))}
      </ol>

      <div className="mt-4 border-t border-line px-4 py-4 sm:px-5">
        {next ? (
          <>
            <p className="text-sm">
              <span className="font-semibold">Next: {next.label}</span> <span className="text-muted">· {next.perk}</span>
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Progress label="Feedback given" value={given} goal={next.given} />
              {next.helpful > 0 && <Progress label="Marked helpful" value={helpful} goal={next.helpful} />}
            </div>
          </>
        ) : (
          <p className="text-sm font-semibold">Top rank. Your feedback shows first to builders.</p>
        )}
      </div>

      <div className="border-t border-line px-4 py-4 sm:px-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold">Stamps</p>
          <p className="font-mono text-xs text-muted">
            {stamped.length}/{CATEGORIES.length}
            {stamped.length === CATEGORIES.length ? " · All-rounder" : ""}
          </p>
        </div>
        {stamped.length > 0 ? (
          <ul aria-label="Categories tested" className="mt-3 flex flex-wrap gap-x-3 gap-y-3 py-1">
            {stamped.map((c, i) => {
              const n = passport.categories[c.slug] ?? 0;
              return (
                <li
                  key={c.slug}
                  title={`${c.label}: ${n} tested`}
                  className="stamp rise"
                  style={{ "--i": i, rotate: `${TILT[i % TILT.length]}deg` } as React.CSSProperties}
                >
                  <span>{c.label}</span>
                  <span className="stamp-count">×{n}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted">No stamps yet. Test an app in any category to get the first one.</p>
        )}
        {toCollect.length > 0 && stamped.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            Still to collect: {toCollect.map((c) => c.label).join(" · ")}
          </p>
        )}
      </div>

      <p className="border-t border-line bg-bg/40 px-4 py-3 text-xs text-muted sm:px-5">
        Give feedback {STREAK_BONUS.weeks} weeks in a row for a <Coin />
        {STREAK_BONUS.credits} bonus. Ranks never go down.
        {isSelf && (
          <>
            {" "}
            <Link href="/test" className="text-accent hover:underline">
              Find apps to test →
            </Link>
          </>
        )}
      </p>
    </section>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-4 py-2 text-center sm:px-5">
      <dd className="font-mono text-2xl font-bold">{formatCount(value)}</dd>
      <dt className="text-[11px] whitespace-nowrap text-muted">{label}</dt>
    </div>
  );
}

function Progress({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = Math.min(100, Math.round((value / goal) * 100));
  const done = value >= goal;
  return (
    <div>
      <div className="flex justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={`font-mono ${done ? "text-accent" : "text-ink"}`}>
          {done ? "✓ " : ""}
          {Math.min(value, goal)}/{goal}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function RankTag({ rank }: { rank: string }) {
  if (rank === "new") return null;
  const r = TESTER_RANKS.find((x) => x.slug === rank);
  return <span className={rank === "trusted" || rank === "pro" ? "tag-accent" : "tag"}>{r?.label ?? rank}</span>;
}

export function TopBuilders({ builders }: { builders: TopBuilder[] }) {
  const month = new Date().toLocaleDateString("en-US", { month: "long" });
  return (
    <section aria-label="Top builders" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="display text-4xl">Top builders · {month}</h2>
      <p className="mt-1 text-sm text-muted">Ranked by tries on their apps and likes on their Drops this month.</p>
      {builders.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nobody yet this month. Post a Drop and be the first.</p>
      ) : (
        <ol className="mt-3 divide-y divide-line">
          {builders.map((b, i) => (
            <li key={b.user_id} className="flex items-center gap-3 py-2.5">
              <span className={`w-6 font-mono text-sm font-bold ${i < 3 ? "text-accent" : "text-muted"}`}>{i + 1}</span>
              <Link href={`/u/${b.username}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
                <Avatar username={b.username} name={b.display_name} src={b.avatar_url} size={28} />
                <span className="truncate font-semibold">{b.display_name || <Handle username={b.username} />}</span>
              </Link>
              <span className="shrink-0 font-mono text-xs text-muted">
                {formatCount(b.tries)} tries<span className="hidden sm:inline"> · {formatCount(b.likes)} likes</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function TopTesters({ testers }: { testers: TopTester[] }) {
  const month = new Date().toLocaleDateString("en-US", { month: "long" });
  return (
    <section aria-label="Top testers" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="display text-4xl">Top testers · {month}</h2>
      <p className="mt-1 text-sm text-muted">Ranked by feedback builders marked helpful, then by feedback given.</p>
      {testers.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Nobody yet this month. Be the first.</p>
      ) : (
        <ol className="mt-3 divide-y divide-line">
          {testers.map((t, i) => (
            <li key={t.user_id} className="flex items-center gap-3 py-2.5">
              <span className={`w-6 font-mono text-sm font-bold ${i < 3 ? "text-accent" : "text-muted"}`}>{i + 1}</span>
              <Link href={`/u/${t.username}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
                <Avatar username={t.username} name={t.display_name} src={t.avatar_url} size={28} />
                <span className="truncate font-semibold">{t.display_name || <Handle username={t.username} />}</span>
              </Link>
              <span className="shrink-0 font-mono text-xs text-muted">
                {t.helpful_count} helpful<span className="hidden sm:inline"> · {t.feedback_count} given</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
