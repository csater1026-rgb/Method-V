import Link from "next/link";
import { Coin } from "./Coin";

export function CreditsChip({ credits }: { credits: number }) {
  return (
    <Link
      href="/credits"
      data-tour="credits"
      aria-label={`${credits} V Coin`}
      title="Your V Coin"
      className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 font-mono text-xs font-semibold hover:border-accent"
    >
      <Coin />
      {credits}
    </Link>
  );
}
