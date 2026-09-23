type Day = { day: string; tries: number; sponsored: number };

// Tries per day as simple bars; the darker part came from sponsor cards.
export function StatsChart({ stats, label }: { stats: Day[]; label: string }) {
  const max = Math.max(1, ...stats.map((s) => s.tries));
  const total = stats.reduce((n, s) => n + s.tries, 0);
  const sponsored = stats.reduce((n, s) => n + s.sponsored, 0);
  return (
    <figure aria-label={label}>
      <div className={`flex h-36 items-end ${stats.length > 40 ? "gap-px" : "gap-[3px]"}`} role="img" aria-label={`${total} tries in ${stats.length} days`}>
        {stats.map((s) => (
          <div key={s.day} className="flex h-full flex-1 flex-col justify-end" title={`${s.day}: ${s.tries} tries`}>
            <div className="flex flex-col justify-end rounded-t-sm bg-accent/40" style={{ height: `${(s.tries / max) * 100}%` }}>
              <div className="bg-accent" style={{ height: s.tries ? `${(Math.min(s.sponsored, s.tries) / s.tries) * 100}%` : 0 }} />
            </div>
          </div>
        ))}
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-x-4 font-mono text-xs text-muted">
        <span>
          <strong className="text-ink">{total}</strong> tries in {stats.length} days
        </span>
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-sm bg-accent" />
          <strong className="text-ink">{sponsored}</strong> sent to you by sponsor cards
        </span>
      </figcaption>
    </figure>
  );
}
