// The video area of a Drop. Sample Drops in demo mode have no video, so they
// get a styled placeholder instead.

import { CATEGORIES, labelFor } from "@/lib/constants";

export function DropPlaceholder({ name, category }: { name: string; category: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_30%_20%,#2c3a12,transparent_55%),radial-gradient(circle_at_80%_80%,#23163f,transparent_50%)] bg-surface p-6 text-center">
      <span className="text-xs uppercase tracking-[0.2em] text-muted">{labelFor(CATEGORIES, category)}</span>
      <span className="text-4xl font-black tracking-tight">{name}</span>
      <span className="rounded-full border border-line px-3 py-1 text-xs text-muted">Sample Drop · no video</span>
    </div>
  );
}
