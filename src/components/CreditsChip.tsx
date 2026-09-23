import Link from "next/link";

export function CreditsChip({ credits }: { credits: number }) {
  return (
    <Link
      href="/credits"
      aria-label={`${credits} credits`}
      title="Your credits"
      className="flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-1 text-sm font-semibold hover:border-accent"
    >
      <span className="text-accent" aria-hidden>
        ⚡
      </span>
      {credits}
    </Link>
  );
}
