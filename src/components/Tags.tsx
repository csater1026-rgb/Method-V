import { CATEGORIES, PRICING, ROLES, STAGES, labelFor } from "@/lib/constants";

export function RoleTags({ roles, className = "" }: { roles: string[]; className?: string }) {
  if (roles.length === 0) return null;
  return (
    <ul className={`flex flex-wrap gap-1.5 ${className}`}>
      {roles.map((r) => (
        <li
          key={r}
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            r === "hiring" || r === "looking_for_work"
              ? "bg-accent/15 text-accent"
              : "bg-surface-2 text-muted"
          }`}
        >
          {labelFor(ROLES, r)}
        </li>
      ))}
    </ul>
  );
}

export function Chip({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "accent" }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        tone === "accent" ? "bg-accent text-accent-ink" : "bg-surface-2 text-muted"
      }`}
    >
      {children}
    </span>
  );
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
