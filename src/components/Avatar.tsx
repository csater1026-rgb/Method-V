// A colored circle with the builder's first letter. Photo uploads come later.

const COLORS = ["#c8ff3d", "#7cc4ff", "#ff9f5a", "#c49bff", "#5de0b5", "#ff7aa8", "#ffd84d"];

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
      className="inline-flex shrink-0 items-center justify-center rounded-full font-bold text-accent-ink"
      style={{ width: size, height: size, background: colorFor(username), fontSize: size * 0.42 }}
    >
      {letter}
    </span>
  );
}
