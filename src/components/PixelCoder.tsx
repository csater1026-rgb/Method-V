// A pixel-art builder at their computer: code types itself across the screen,
// the cursor blinks, hands tap the keyboard, and pixels drift up and fade.
// Pure SVG + CSS (see the pc-* rules in globals.css), so it works anywhere,
// including loading screens, and holds still for people who reduce motion.

const W = 32;
const H = 20;

// One character per pixel. Colors come from the theme where it makes sense.
const ART = [
  "................................",
  "................................",
  "......hhhh......................",
  ".....hhhhhh.......MMMMMMMMMMMM..",
  ".....hhhhss.......MSSSSSSSSSSM..",
  ".....hhhsss.......MSSSSSSSSSSM..",
  "......ssss........MSSSSSSSSSSM..",
  ".......ss.........MSSSSSSSSSSM..",
  ".....tttttt.......MSSSSSSSSSSM..",
  "....tttttttt......MSSSSSSSSSSM..",
  "....tttttttttt....MMMMMMMMMMMM..",
  "....tttttt............MM........",
  "...kppppppp...........MM........",
  "...kkkkkkkkkDDDDDDDDDDDDDDDDDDD.",
  "...k.......k.D...............D..",
  "...k.......k.D...............D..",
  "..kk.......kk.D.............D...",
  "................................",
  "................................",
  "................................",
];

const COLORS: Record<string, string> = {
  h: "#6b4a2f",
  s: "#d9b38c",
  t: "var(--color-accent)",
  p: "var(--color-muted)",
  k: "var(--color-line)",
  M: "var(--color-muted)",
  S: "#0d120f",
  D: "var(--color-line)",
};

// Merge runs of the same color in a row into one rect.
function rects() {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  ART.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      if (COLORS[ch]) out.push({ x, y, w: end - x, fill: COLORS[ch] });
      x = end;
    }
  });
  return out;
}

const BODY = rects();

// Code lines on the screen: [x, y, length, delay seconds].
const CODE: [number, number, number, number][] = [
  [20, 5, 5, 0],
  [21, 6, 6, 0.6],
  [21, 7, 4, 1.2],
  [20, 8, 7, 1.8],
];

// Floating pixels: [x, y, drift, delay seconds].
const DUST: [number, number, number, number][] = [
  [6, 2, -2, 0],
  [9, 3, 2, 0.7],
  [20, 3, -1, 1.3],
  [27, 3, 2, 2.1],
  [11, 8, -2, 2.8],
  [24, 2, 1, 3.4],
  [8, 1, 1, 4.1],
  // …and a few breaking off the builder themself.
  [5, 4, -2, 0.4],
  [10, 5, 2, 1.6],
  [4, 9, -1, 2.4],
  [7, 2, 1, 3.7],
];

export function PixelCoder({
  size = 96,
  className = "",
  title,
  animated = true,
}: {
  size?: number;
  className?: string;
  title?: string;
  animated?: boolean;
}) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={size}
      height={(size * H) / W}
      shapeRendering="crispEdges"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`${animated ? "pc-animated" : ""} ${className}`}
    >
      {title && <title>{title}</title>}
      {BODY.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
      {/* hands on the keyboard */}
      <rect className="pc-hands" x={14} y={10} width={2} height={1} fill="#d9b38c" />
      {CODE.map(([x, y, w, delay], i) => (
        <rect
          key={i}
          className="pc-code"
          x={x}
          y={y}
          width={w}
          height={0.6}
          fill={i % 2 ? "var(--color-ink)" : "var(--color-accent)"}
          style={{ animationDelay: `${delay}s` }}
        />
      ))}
      <rect className="pc-cursor" x={27.5} y={8} width={0.6} height={0.6} fill="var(--color-accent)" />
      {DUST.map(([x, y, dx, delay], i) => (
        <rect
          key={i}
          className="pc-dust"
          x={x}
          y={y}
          width={1}
          height={1}
          fill={i % 3 === 1 ? "var(--color-ink)" : "var(--color-accent)"}
          style={{ animationDelay: `${delay}s`, "--dx": `${dx}px` } as React.CSSProperties}
        />
      ))}
    </svg>
  );
}
