import { CATEGORIES, PRICING, ROLES, STAGES, labelFor } from "@/lib/constants";

// "except" leaves out a role already shown elsewhere, like the StatusBadge.
export function RoleTags({ roles, except, className = "" }: { roles: string[]; except?: string | null; className?: string }) {
  const shown = roles.filter((r) => r !== except);
  if (shown.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`}>
      {shown.map((r) => (
        <li key={r} className={r === "hiring" || r === "looking_for_work" ? "tag border-accent/60 text-accent" : "tag"}>
          {labelFor(ROLES, r)}
        </li>
      ))}
    </ul>
  );
}

// The one status people message about, shown next to someone's avatar.
const STATUS_ORDER = ["hiring", "looking_for_work", "open_to_collab", "freelancer"] as const;

export function primaryStatus(roles: string[]): string | null {
  return STATUS_ORDER.find((r) => roles.includes(r)) ?? null;
}

export function StatusBadge({ roles, className = "" }: { roles: string[]; className?: string }) {
  const status = primaryStatus(roles);
  if (!status) return null;
  return <span className={`tag-accent whitespace-nowrap ${className}`}>{labelFor(ROLES, status)}</span>;
}

export function Chip({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "accent" }) {
  return <span className={tone === "accent" ? "tag-accent" : "tag"}>{children}</span>;
}

export function CategoryChip({ category }: { category: string }) {
  return <Chip>{labelFor(CATEGORIES, category)}</Chip>;
}

export function PricingStage({ pricing, stage }: { pricing: string; stage: string }) {
  return (
    <>
      <Chip>{labelFor(PRICING, pricing)}</Chip>
      <Chip>{labelFor(STAGES, stage)}</Chip>
    </>
  );
}
