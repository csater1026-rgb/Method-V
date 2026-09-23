// A colored circle with the builder's first letter. Photo uploads come later.

// Soft tones that sit with blue, mint, cyan and white in both themes; the letter is always dark.
const COLORS = ["#82ed9d", "#9fd8fb", "#d9b38c", "#40f4f5", "#c7b6d6", "#e2a597", "#b8f3c8"];

function colorFor(username: string): string {
  let hash = 0;
  for (const ch of username) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return COLORS[hash % COLORS.length];
}

export function Avatar({ username, name, size = 40 }: { username: string; name?: string; size?: number }) {
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
