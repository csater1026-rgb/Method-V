// A colored circle with the builder's first letter. Photo uploads come later.

const COLORS = ["#ff5b1f", "#f1ece2", "#ffb347", "#7fd1b9", "#e8c547", "#ff8fab", "#9ecbff"];

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
      className="display inline-flex shrink-0 items-center justify-center rounded-full pt-[0.08em] text-accent-ink"
      style={{ width: size, height: size, background: colorFor(username), fontSize: size * 0.56 }}
    >
      {letter}
    </span>
  );
}
