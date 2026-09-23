import type { SponsorCard } from "@/lib/types";

// The Boost Exchange "Sponsored by" card. Always labeled, and the link is a
// plain <a> to /try so only real taps count (and are paid for).
export function SponsoredBy({ sponsor, compact = false }: { sponsor: SponsorCard; compact?: boolean }) {
  // Brands live outside Method V, so their cards go through /go instead of /try.
  const href = sponsor.kind === "brand" ? `/go/${sponsor.slug}?s=${sponsor.id}` : `/try/${sponsor.slug}?s=${sponsor.id}&via=sponsor`;
  if (compact) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener sponsored"
        className="pointer-events-auto flex items-center gap-2 rounded-md bg-black/55 px-2.5 py-1.5 text-xs backdrop-blur hover:bg-black/70"
      >
        <span className="font-mono text-[10px] tracking-wide text-white/70 uppercase">Sponsored</span>
        <span className="truncate font-semibold">{sponsor.name}</span>
        <span aria-hidden>→</span>
      </a>
    );
  }
  return (
    <aside aria-label="Sponsored" className="rounded-xl border border-line bg-surface-2/60 p-4">
      <p className="font-mono text-[10px] tracking-widest text-muted uppercase">Sponsored · Boost Exchange</p>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="display text-3xl">{sponsor.name}</p>
          <p className="text-sm text-muted">{sponsor.tagline}</p>
        </div>
        <a href={href} target="_blank" rel="noopener sponsored" className="btn-ghost">
          {sponsor.kind === "brand" ? "Visit" : "Try"} {sponsor.name} →
        </a>
      </div>
    </aside>
  );
}
