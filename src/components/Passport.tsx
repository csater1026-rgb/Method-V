import Link from "next/link";

import { CATEGORIES, STREAK_BONUS, TESTER_RANKS, testerRank } from "@/lib/constants";
import { formatCount } from "@/lib/format";
import type { Passport as PassportData, Profile, TopBuilder, TopTester } from "@/lib/types";

import { Avatar } from "./Avatar";

// The Tester Passport on a profile: rank, progress to the next rank, a stamp
// per category tested and the weekly streak.
export function PassportCard({ profile, passport, isSelf }: { profile: Profile; passport: PassportData; isSelf: boolean }) {
  const given = profile.feedback_given_count;
  const helpful = profile.feedback_helpful_count;
  const rankSlug = testerRank(given, helpful);
  const index = TESTER_RANKS.findIndex((r) => r.slug === rankSlug);
  const rank = TESTER_RANKS[index];
  const next = TESTER_RANKS[index + 1];
  const stamped = CATEGORIES.filter((c) => (passport.categories[c.slug] ?? 0) > 0).length;

  return (
    <section aria-label="Tester Passport" className="rounded-xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10.5px] tracking-widest text-muted uppercase">Tester Passport</p>
          <h2 className="display mt-1 text-4xl">{rank.label}</h2>
          <p className="mt-1 text-sm text-muted">{rank.perk}</p>
        </div>
        <div className="flex gap-2">
          <Stat value={given} label="feedback" />
          <Stat value={helpful} label="helpful" />
          <Stat value={passport.streak} label={passport.streak === 1 ? "week streak" : "wk streak"} />
        </div>
      </div>

      {next && (
        <div className="mt-4">
          <p className="text-sm">
            Next: <span className="font-semibold">{next.label}</span>{" "}
            <span className="text-muted">· {next.perk}</span>
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <Progress label="Feedback" value={given} goal={next.given} />
            {next.helpful > 0 && <Progress label="Marked helpful" value={helpful} goal={next.helpful} />}
          </div>
        </div>
      )}

      <div className="mt-5">
        <p className="text-sm">
          <span className="font-semibold">Stamps</span>{" "}
          <span className="text-muted">
            · {stamped} of {CATEGORIES.length} categories
            {stamped === CATEGORIES.length ? " · All-rounder" : ""}
          </span>
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {CATEGORIES.map((c, i) => {
            const n = passport.categories[c.slug] ?? 0;
            return (
              <li
                key={c.slug}
                title={`${c.label}: ${n} tested`}
                className={`rise flex h-[62px] w-[62px] flex-col items-center justify-center rounded-full border-2 text-center ${
                  n > 0 ? "-rotate-6 border-accent bg-accent/10 text-accent" : "border-dashed border-line text-muted/60"
                }`}
                style={{ "--i": i } as React.CSSProperties}
              >
                <span className="font-mono text-[8.5px] leading-tight tracking-wide uppercase">{c.label.split(" ")[0]}</span>
                {n > 0 && <span className="font-mono text-xs font-bold">{n}</span>}
              </li>
            );
          })}
        </ul>
      </div>

      <p className="mt-4 text-xs text-muted">
        Give feedback {STREAK_BONUS.weeks} weeks in a row for a ⚡{STREAK_BONUS.credits} bonus. Ranks never go down.
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
    <div className="min-w-16 rounded-lg border border-line bg-bg/50 px-2.5 py-1.5 text-center">
      <div className="font-mono text-lg font-bold">{value}</div>
      <div className="font-mono text-[9.5px] tracking-wide text-muted uppercase">{label}</div>
    </div>
  );
}

function Progress({ label, value, goal }: { label: string; value: number; goal: number }) {
  const pct = Math.min(100, Math.round((value / goal) * 100));
  return (
    <div>
      <div className="flex justify-between font-mono text-[10.5px] text-muted uppercase">
        <span>{label}</span>
        <span>
          {Math.min(value, goal)} / {goal}
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
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
                <span className="truncate font-semibold">{b.display_name || `@${b.username}`}</span>
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
                <span className="truncate font-semibold">{t.display_name || `@${t.username}`}</span>
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
