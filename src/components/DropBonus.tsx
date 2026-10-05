import type { Promotion } from "@/lib/types";

import { Coin } from "./Coin";

function endDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
}

// "Post a Drop, get +10 Methodium" while the promotion runs (public.promotions),
// on the post and manage pages. Home shows it as a pop-up (DropBonusPopup).
export function DropBonusBanner({ promo, className = "" }: { promo: Promotion | null; className?: string }) {
  if (!promo) return null;
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-accent/60 bg-accent/10 px-4 py-3 ${className}`}>
      <p className="text-sm">
        <strong>
          🎉 Post a Drop, get +<Coin />
          {promo.amount} Methodium.
        </strong>{" "}
        <span className="text-muted">
          Until {endDate(promo.ends_at)}: one bonus per app, up to {promo.per_day} a day. Spend it on testers or a Spotlight spot.
        </span>
      </p>
    </div>
  );
}
