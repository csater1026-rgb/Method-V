import Link from "next/link";

import type { Promotion } from "@/lib/types";

import { Coin } from "./Coin";

function endDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
}

// "Post a Drop, get +10 V Coin" while the promotion runs (public.promotions).
// `cta` adds a Post button (on Home); the rules are always spelled out.
export function DropBonusBanner({ promo, cta = false, className = "" }: { promo: Promotion | null; cta?: boolean; className?: string }) {
  if (!promo) return null;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/60 bg-accent/10 px-4 py-3 ${className}`}>
      <p className="text-sm">
        <strong>
          🎉 Post a Drop, get +<Coin />
          {promo.amount} V Coin.
        </strong>{" "}
        <span className="text-muted">
          Until {endDate(promo.ends_at)}: one bonus per app, up to {promo.per_day} a day. Spend it on testers or a Spotlight on Featured.
        </span>
      </p>
      {cta && (
        <Link href="/submit" className="btn-accent shrink-0">
          Post a Drop →
        </Link>
      )}
    </div>
  );
}
