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
// The footer's big version, in the bottom-left corner of every page: a
// 72x48 sprite in greys and black, with an outline around every shape,
// 2-3 shades per surface and checkerboard dithering in the shadows. A
// builder in a hoodie and headphones at an office chair, desk, monitor,
// keyboard, mouse, mug and plant. Same motion as the small one: code types
// itself, the cursor blinks, the hand taps, steam and pixels drift up.
// ---------------------------------------------------------------------------

const BIG_W = 72;
const BIG_H = 48;

const BIG_ART = [
  "........................................................................",
  "....................KKKKKKKK............................................",
  "...................K33333333K..............KKKKKKKKKKKKKKKKKKKKKKKKKKK..",
  "...................K13222211K.............K333333333333333333333333333K.",
  "..................K1131111111K............K222222222222222222222222222K.",
  ".................K11131188111K............K223636363333333333333333322K.",
  ".................K121388888818K...........K22SSSSSSSSSSSSSSSSSSSSSSS22K.",
  ".................K113338822288K...........K22SSSSSSSSSSSSSSSSSSSSSSS22K.",
  ".................K12353888K888K...........K22SSSSSSSSSSSSSSSSSSSSSSS22K.",
  ".................K1134388888887K..........K22SSSSSSSSSSSSSSSSSSSSSSS22K.",
  ".................K113338888888K...........K22SSSSSSSSSSSSSSSSSSSSSSS22K.",
  "..........KKK....K11178888866K............K22SSSSSSSSSSSSSSSSSSSSSSS22K.",
  ".........K222K....KKK6777777K.............K22SSSSSSSSSSSSSSSSSSSSSSS22K.",
  ".........K222K..KKKKK688888K..............K22SSSSSSSSSSSSSSSSSSSSSSS22K.",
  "........K23322KK344446777KK...............K22SSSSSSSSSSSSSSSSSSSSSSS22K.",
  "........K23322KK333336777KKK..............K22SSSSSSSSSSSSSSSSSSSSSSS22K.",
  "........K23322KK333336777444K.............K22SSSSSSSSSSSSSSSSSSSSSSS22K.",
  ".......K2233222K343444444556K.............K22SSSSSSSSSSSSSSSSSSSSSSS22K.",
  ".......K2233222K434444445555K.............K222222222222222222222222222K.",
  ".......K2233222K343444445555K.............K2222222222222222222222222226K",
  ".......K2233222K434444445555K..............KKKKKKKKKKKK454KKKKKKKKKK5KK5",
  ".......K2233222K343444445555K.........................K454K..K6666KKK64K",
  ".......K2233222K434444445555KKKKKKKKKK................K454K..K788888KK5K",
  ".......K2233222K3434444455556666666666K...............K454K..K788888K544",
  ".......K2233222K4344444455555555555555KKKKKKKK..KKKKKKK454KKKK788888K544",
  ".......K2233222K343444445555555555555525252522KK633344444444437888KKK544",
  ".......K2233222K434444445554444444444422222222KK333333333333337888KKK544",
  ".......K2233222K343444444555KKK77777777777777777777777777777777777777777",
  "........K23322KK434355555535K.K55555555555555555555555555555555555555555",
  "........K23322KK343333333335K.K33333333333333333333333333333333333333333",
  "........K23322KK434333333335KKKKKKKKKKKKKKKK43KKKKKKKKKKKKKKKKKKKKKK43KK",
  ".........K222K.K34344444455533333333332K...K43K....................K43K.",
  ".........K222K.K43444444444422222222222K...K43K....................K43K.",
  ".........KKKKKKKKKKK2222222222222222222K...K43K....................K43K.",
  "........K233333333332222222222222222222K...K43K....................K43K.",
  "........K2222222222222222222222222222222K..K43K....................K43K.",
  "........K2222222222222222222KKKKKK222233K..K43K....................K43K.",
  ".........KKKKKKK54KKKKKKKKKK.....K222233K..K43K....................K43K.",
  "...............K54K..............K222233K..K43K....................K43K.",
  "...............K54K..............K222233K..K43K....................K43K.",
  "...............K54K..............K222233K..K43K....................K43K.",
  "...............K54K..............K222233K..K43K....................K43K.",
  ".........KKKKKKK54KKKKKKKK.......K222233K..K43K....................K43K.",
  "........K22222222222222222K......K222233KKKK43K....................K43K.",
  "........K11KKKKK11KKKKKK11K.....K1111141411K43K....................K43K.",
  "........K11K...K11K....K11K.....K1111111111K43K....................K43K.",
  ".........KK.....KK......KK......K3333333333K43K....................K43K.",
  "......2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.2.",
];

// Greys and black only: K is the outline, 1 (darkest) to 9 (lightest), S the screen.
const BIG_COLORS: Record<string, string> = {
  K: "#0a0a0a",
  "1": "#161616",
  "2": "#262626",
  "3": "#3a3a3a",
  "4": "#555555",
  "5": "#717171",
  "6": "#8e8e8e",
  "7": "#ababab",
  "8": "#c8c8c8",
  "9": "#e6e6e6",
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
  [47, 8, 9, 0, "#e6e6e6"],
  [49, 10, 12, 0.6, "#8e8e8e"],
  [49, 12, 7, 1.2, "#e6e6e6"],
  [47, 14, 14, 1.8, "#8e8e8e"],
];

// Drifting pixels: [x, y, drift, delay seconds]. Steam over the mug, and
// pixels breaking off the builder and the screen.
const BIG_DUST: [number, number, number, number][] = [
  [63, 19, -1, 0],
  [64, 18, 1, 1.4],
  [63, 17, 0, 2.8],
  [21, 1, -2, 0.5],
  [27, 1, 2, 1.9],
  [17, 4, -1, 3.2],
  [48, 1, 1, 1.1],
  [60, 1, -1, 2.4],
  [55, 0, 2, 3.8],
];

export function PixelCoderDetailed({ size = 320, title, className = "" }: { size?: number; title?: string; className?: string }) {
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
      <rect className="pc-hands" x={38} y={23} width={3} height={3} fill="#c8c8c8" />
      {BIG_CODE.map(([x, y, w, delay, fill], i) => (
        <rect key={i} className="pc-code" x={x} y={y} width={w} height={1} fill={fill} style={{ animationDelay: `${delay}s` }} />
      ))}
      <rect className="pc-cursor" x={62} y={14} width={1} height={1} fill="#e6e6e6" />
      {BIG_DUST.map(([x, y, dx, delay], i) => (
        <rect
          key={i}
          className="pc-dust"
          x={x}
          y={y}
          width={1}
          height={1}
          fill={i < 3 ? "#e6e6e6" : i % 2 ? "#717171" : "#ababab"}
          style={{ animationDelay: `${delay}s`, "--dx": `${dx}px` } as React.CSSProperties}
        />
      ))}
    </svg>
  );
}
