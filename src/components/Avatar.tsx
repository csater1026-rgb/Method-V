// A builder's profile photo, or a colored circle with their first letter when
// they haven't added one.

// Soft tones that sit with blue, mint, cyan and white in both themes; the letter is always dark.
const COLORS = ["#82ed9d", "#9fd8fb", "#d9b38c", "#40f4f5", "#c7b6d6", "#e2a597", "#b8f3c8"];

function colorFor(username: string): string {
  let hash = 0;
  for (const ch of username) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function Avatar({
  username,
  name,
  src,
  size = 40,
}: {
  username: string;
  name?: string;
  src?: string | null;
  size?: number;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className="inline-block shrink-0 rounded-full bg-surface-2 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  const letter = (name || username).trim().charAt(0).toUpperCase() || "?";
  return (
    <span
      aria-hidden
      className="display inline-flex shrink-0 items-center justify-center rounded-full pt-[0.08em] text-[#0b1b2b]"
      style={{ width: size, height: size, background: colorFor(username), fontSize: size * 0.56 }}
    >
      {letter}
    </span>
  );
}
