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
  S: "#06101a",
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

// ---------------------------------------------------------------------------
// The footer's big version: more detail (headphones, office chair, keyboard,
// mug, desk) in greys and black, sitting in the bottom-left corner of every
// page. Same motion as the small one: code types itself, the cursor blinks,
// the hand taps, steam and pixels drift up and fade.
// ---------------------------------------------------------------------------

const BIG_W = 56;
const BIG_H = 34;

const BIG_ART = [
  "........................................................",
  "........................................................",
  "........................................................",
  "...........GGGGG.................MMMMMMMMMMMMMMMMMMMM...",
  "...........KKKKK.................MSSSSSSSSSSSSSSSSSSM...",
  "..........KKDDDKK................MSSSSSSSSSSSSSSSSSSM...",
  ".........KDDKKKKK................MSSSSSSSSSSSSSSSSSSM...",
  ".........KGGKFDDF................MSSSSSSSSSSSSSSSSSSM...",
  ".........KLGFFFKFF...............MSSSSSSSSSSSSSSSSSSM...",
  ".........KGGFFFFFF...............MSSSSSSSSSSSSSSSSSSM...",
  "..........KKFFFFF................MSSSSSSSSSSSSSSSSSSM...",
  ".............FFF.................MSSSSSSSSSSSSSSSSSSM...",
  "...DDDD.....FF...................MSSSSSSSSSSSSSSSSSSM...",
  "...DGDD.GGGGGGGMMM...............MSSSSSSSSSSSSSSSSSSM...",
  "...DGDD.GGMMMMMMMM...............MSSSSSSSSSSSSSSSSSSM...",
  "...DGDD.GGMMMMLLLL...............MKKKKKKKKKKKKKKKKKKM...",
  "...DGDD.GGMMMMLLLL...............GGGGGGGGGGGGGGGGGGGG...",
  "...DGDD.GGMMMMLLLL.......................GGGG...LLL.....",
  "...DGDD.GGMMMMLLLL.......................GGGG...WWWW....",
  "...DGDD.GGMMMMMMLLLLLLLLLLLM.M.M.........GGGG...WWWW....",
  "...DGDD.GGMMMMMMMMMMMMMMMMMDDDDDDD....DDDDDDDDDDWWW.....",
  "...DGDD.GGMMGGGGLL.LLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLLL",
  "...DGDD.GGMMGGGGLL.DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD",
  "...DGDD.GGMMMMMMLL...DD.............................DD..",
  "...DDDD.GGMMDDDDDDDDDDDDD...........................DD..",
  "....GGGGGGGGDDDDDDDDDDDDD...........................DD..",
  "....DDDDDDDDDDDDDD...DDDD...........................DD..",
  "..........MM.........DDDD...........................DD..",
  "..........MM.........DDDD...........................DD..",
  "..........MM.........DDDD...........................DD..",
  ".....DDDDDDDDDDDD....DDDD...........................DD..",
  ".....KK...KK...KK....KDDDDDK........................DD..",
  ".....................KKKKKKK........................DD..",
  "........................................................",
];

// Greys and black only. The darkest parts get a lighter edge in the art so
// the figure still reads on the dark theme.
const BIG_COLORS: Record<string, string> = {
  K: "#0f0f0f",
  D: "#2b2b2b",
  G: "#4a4a4a",
  M: "#737373",
  L: "#a1a1a1",
  W: "#d6d6d6",
  F: "#b8b8b8",
  S: "#050505",
};

function bigRects() {
  const out: { x: number; y: number; w: number; fill: string }[] = [];
  BIG_ART.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const ch = row[x];
      let end = x + 1;
      while (end < row.length && row[end] === ch) end++;
      if (BIG_COLORS[ch]) out.push({ x, y, w: end - x, fill: BIG_COLORS[ch] });
      x = end;
    }
  });
  return out;
}

const BIG_BODY = bigRects();

// Code lines on the monitor: [x, y, length, delay seconds, color].
const BIG_CODE: [number, number, number, number, string][] = [
  [36, 6, 8, 0, "#e8e8e8"],
  [37, 8, 11, 0.6, "#8f8f8f"],
  [37, 10, 6, 1.2, "#e8e8e8"],
  [36, 12, 10, 1.8, "#8f8f8f"],
];

// Drifting pixels: [x, y, drift, delay seconds]. Steam over the mug, and
// pixels breaking off the builder and the screen.
const BIG_DUST: [number, number, number, number][] = [
  [49, 15, -1, 0],
  [50, 14, 1, 1.4],
  [49, 13, 0, 2.8],
  [12, 2, -2, 0.5],
  [16, 3, 2, 1.9],
  [9, 5, -1, 3.2],
  [38, 2, 1, 1.1],
  [46, 2, -1, 2.4],
  [42, 1, 2, 3.8],
];

export function PixelCoderDetailed({ size = 280, title, className = "" }: { size?: number; title?: string; className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${BIG_W} ${BIG_H}`}
      width={size}
      height={(size * BIG_H) / BIG_W}
      shapeRendering="crispEdges"
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={`pc-animated ${className}`}
    >
      {title && <title>{title}</title>}
      {BIG_BODY.map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />
      ))}
      {/* hand on the keyboard */}
      <rect className="pc-hands" x={27} y={19} width={2} height={2} fill="#b8b8b8" />
      {BIG_CODE.map(([x, y, w, delay, fill], i) => (
        <rect key={i} className="pc-code" x={x} y={y} width={w} height={0.8} fill={fill} style={{ animationDelay: `${delay}s` }} />
      ))}
      <rect className="pc-cursor" x={47} y={12} width={1} height={0.8} fill="#e8e8e8" />
      {BIG_DUST.map(([x, y, dx, delay], i) => (
        <rect
          key={i}
          className="pc-dust"
          x={x}
          y={y}
          width={1}
          height={1}
          fill={i < 3 ? "#d6d6d6" : i % 2 ? "#737373" : "#a1a1a1"}
          style={{ animationDelay: `${delay}s`, "--dx": `${dx}px` } as React.CSSProperties}
        />
      ))}
    </svg>
  );
}
