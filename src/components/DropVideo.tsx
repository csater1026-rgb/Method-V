// The video area of a Drop. Sample Drops in demo mode have no video, so they
// get a striped "drop poster" instead. In the feed the caption already shows
// the name, so the poster keeps it as a faint watermark; "bare" is just the
// stripes, for cards that draw their own caption.

import { CATEGORIES, labelFor } from "@/lib/constants";

export function DropPlaceholder({
  name,
  category,
  variant = "card",
}: {
  name: string;
  category: string;
  variant?: "card" | "feed" | "bare";
}) {
  const feed = variant === "feed";
  return (
    <div className="@container relative h-full w-full overflow-hidden bg-surface">
      <div
        aria-hidden
        className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent_0_14px,rgb(255_91_31/0.09)_14px_16px)]"
      />
      <div aria-hidden className="absolute -right-[20%] -bottom-[20%] h-[70%] w-[70%] rounded-full bg-accent/25 blur-3xl" />
      {variant !== "bare" && (
        <div className={`relative flex h-full flex-col justify-between p-4 ${feed ? "pt-36 pb-56" : ""}`}>
          {feed ? (
            <span />
          ) : (
            <div className="flex flex-wrap gap-1.5">
              <span className="tag-accent">{labelFor(CATEGORIES, category)}</span>
              <span className="tag bg-bg/60">Sample drop</span>
            </div>
          )}
          <p
            aria-hidden={feed}
            className={`display ${feed ? "overflow-hidden text-[20cqw] whitespace-nowrap text-ink/10" : "text-[17cqw] break-words"}`}
          >
            {name}
          </p>
          <p className="font-mono text-[10px] tracking-widest text-muted uppercase">Sample drop · no video</p>
        </div>
      )}
    </div>
  );
}
