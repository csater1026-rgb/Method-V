import Link from "next/link";
import { Coin } from "./Coin";

export function CreditsChip({ credits }: { credits: number }) {
  return (
    <Link
      href="/store"
      data-tour="credits"
      aria-label={`${credits} Methodium`}
      title="Your Methodium · open the V Store"
      className="flex items-center gap-1.5 rounded-md border border-line bg-surface py-1 pr-2.5 pl-1.5 font-mono text-sm font-bold hover:border-accent"
    >
      {/* Big enough to read the "Mv" on the token at a glance. */}
      <Coin className="!mr-0 !h-[22px]" />
      {credits}
    </Link>
  );
}
