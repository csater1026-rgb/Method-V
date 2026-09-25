import Link from "next/link";

export function CreditsChip({ credits }: { credits: number }) {
  return (
    <Link
      href="/credits"
      data-tour="credits"
      aria-label={`${credits} credits`}
      title="Your credits"
      className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs font-semibold hover:border-accent"
    >
      <span className="text-accent" aria-hidden>
        ⚡
      </span>
      {credits}
    </Link>
  );
}
