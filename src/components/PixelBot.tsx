"use client";

import { useEffect, useRef, useState } from "react";

import { BIG_COLORS as C } from "./PixelCoder";

// The pixel AI computer that sits in the bottom-right corner, opposite the
// pixel builder: a CRT with a face on a PC tower, typing with a robot arm
// while code writes itself on a floating screen. Its eyes follow the pointer,
// and pressing it builds and ships the code. Same 72x48 grid and greys as
// PixelCoderDetailed.

const W = 72;
const H = 48;
const MINT = "#82ed9d";

type Rect = [x: number, y: number, w: number, h: number, fill: string];

function draw() {
  const out: Rect[] = [];
  const box = (x: number, y: number, w: number, h: number, fill: string) => out.push([x, y, w, h, fill]);
  // An outlined box: K border, filled inside.
  const frame = (x: number, y: number, w: number, h: number, fill: string) => {
    box(x, y, w, h, C.K);
    box(x + 1, y + 1, w - 2, h - 2, fill);
  };

  // Floor
  for (let x = 1; x < W; x += 2) box(x, 47, 1, 1, C["2"]);

  // Desk, with a drawer
  frame(2, 32, 44, 3, C["5"]);
  frame(5, 35, 3, 12, C["3"]);
  frame(40, 35, 3, 12, C["3"]);
  frame(26, 35, 12, 5, C["3"]);
  box(30, 37, 4, 1, C["6"]);

  // Keyboard, dithered keys
  frame(16, 29, 22, 4, C["6"]);
  for (let x = 17; x < 37; x++) {
    box(x, 30, 1, 1, x % 2 ? C["8"] : C["4"]);
    box(x, 31, 1, 1, x % 2 ? C["4"] : C["7"]);
  }

  // A stack of books (manuals it no longer needs), page edges showing
  frame(3, 29, 12, 4, C["4"]);
  box(4, 30, 9, 1, C["8"]);
  frame(5, 27, 10, 3, C["2"]);
  box(6, 28, 6, 1, C["7"]);
  frame(4, 25, 11, 3, C["6"]);
  box(5, 26, 7, 1, C["9"]);

  // Neck between the screen and the tower
  frame(54, 23, 9, 5, C["4"]);
  box(55, 25, 7, 1, C["3"]);

  // Tower: drive bays, vents
  frame(49, 27, 19, 20, C["3"]);
  box(50, 28, 1, 18, C["4"]);
  box(66, 28, 1, 18, C["2"]);
  frame(52, 29, 13, 4, C["2"]);
  box(54, 31, 9, 1, C["1"]);
  frame(52, 34, 13, 4, C["2"]);
  box(54, 36, 9, 1, C["1"]);
  for (let x = 52; x < 65; x += 2) {
    box(x, 42, 1, 1, C["1"]);
    box(x + 1, 44, 1, 1, C["1"]);
  }

  // CRT head: bezel with light and shade, dark screen with scanlines
  frame(44, 4, 27, 21, C["5"]);
  box(45, 5, 25, 1, C["6"]);
  box(45, 5, 1, 19, C["6"]);
  box(45, 23, 25, 1, C["3"]);
  box(69, 5, 1, 19, C["3"]);
  frame(47, 7, 21, 14, C.S);
  for (let y = 9; y < 20; y += 2) box(48, y, 19, 1, "#0d0d0d");
  box(49, 9, 2, 1, C["3"]);
  box(49, 10, 1, 1, C["3"]);
  box(49, 22, 2, 1, C["3"]);
  box(52, 22, 2, 1, C["3"]);

  // Antenna stalk (the ball on top blinks)
  box(57, 2, 1, 2, C["5"]);

  // Arm from the tower to the keyboard
  frame(38, 28, 9, 3, C["4"]);
  frame(28, 26, 8, 3, C["4"]);
  frame(35, 26, 4, 4, C["6"]);
  frame(46, 28, 4, 4, C["6"]);
  box(22, 27, 3, 1, C["3"]);

  // Floating code window
  frame(3, 5, 34, 20, C.S);
  box(4, 6, 32, 1, C["3"]);
  box(5, 6, 1, 1, C["7"]);
  box(7, 6, 1, 1, C["6"]);
  box(9, 6, 1, 1, C["5"]);
  for (const y of [9, 11, 13, 15, 17]) box(5, y, 1, 1, C["4"]);
  for (const x of [38, 40, 42]) box(x, 14, 1, 1, C["3"]);

  return out;
}

const BODY = draw();

// Code the AI writes: [x, y, length, delay seconds, color].
const CODE: [number, number, number, number, string][] = [
  [7, 9, 10, 0, C["9"]],
  [9, 11, 14, 0.6, C["6"]],
  [9, 13, 8, 1.2, C["9"]],
  [11, 15, 16, 1.8, C["7"]],
  [7, 17, 6, 2.4, C["6"]],
];

// The check mark once it ships (2x2 pixels each).
const CHECK: [number, number][] = [
  [13, 13], [14, 14], [15, 15], [16, 16], [17, 15], [18, 14], [19, 13], [20, 12], [21, 11], [22, 10], [23, 9],
];

// Sparkles when it ships: [x, y, drift, delay seconds].
const SPARKS: [number, number, number, number][] = [
  [45, 3, -2, 0], [69, 3, 2, 0.2], [57, 0, 0, 0.1], [4, 4, -1, 0.3], [34, 4, 1, 0.15], [20, 4, 0, 0.35],
];

type Mode = "coding" | "building" | "shipped";
const BUILD_MS = 1600;
const SHIPPED_MS = 2600;

export function PixelBot({ className = "" }: { className?: string }) {
  const [mode, setMode] = useState<Mode>("coding");
  const [look, setLook] = useState<[number, number]>([0, 0]);
  const svgRef = useRef<SVGSVGElement>(null);
  const timers = useRef<number[]>([]);

  // Eyes follow the pointer: one pixel left/right/up/down at most.
  useEffect(() => {
    let frame = 0;
    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = svgRef.current?.getBoundingClientRect();
        if (!box) return;
        // Middle of the face, in page pixels.
        const fx = box.left + (box.width * 57.5) / W;
        const fy = box.top + (box.height * 13) / H;
        const dx = Math.max(-1, Math.min(1, Math.round((e.clientX - fx) / 60)));
        const dy = Math.max(-1, Math.min(1, Math.round((e.clientY - fy) / 60)));
        setLook((prev) => (prev[0] === dx && prev[1] === dy ? prev : [dx, dy]));
      });
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  function ship() {
    if (mode !== "coding") return;
    setMode("building");
    timers.current = [
      window.setTimeout(() => setMode("shipped"), BUILD_MS),
      window.setTimeout(() => setMode("coding"), BUILD_MS + SHIPPED_MS),
    ];
  }

  const [dx, dy] = mode === "coding" ? look : [0, 0];
  const status = mode === "building" ? "Building…" : mode === "shipped" ? "Shipped!" : "";

  return (
    <button
      type="button"
      onClick={ship}
      aria-label="A pixel AI computer writing code. Press it to ship."
      className={`block cursor-pointer rounded-sm focus-visible:outline-2 focus-visible:outline-accent ${className}`}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        shapeRendering="crispEdges"
        aria-hidden
        className={`pc-animated block h-auto w-full ${mode === "building" ? "bot-building" : ""}`}
        data-mode={mode}
      >
        {BODY.map(([x, y, w, h, fill], i) => (
          <rect key={i} x={x} y={y} width={w} height={h} fill={fill} />
        ))}

        {/* antenna light and status lights */}
        <rect className="bot-antenna" x={56} y={0} width={3} height={2} fill={mode === "shipped" ? MINT : C["7"]} />
        <rect className="bot-led" x={53} y={40} width={1} height={1} fill={MINT} />
        <rect className="bot-led" x={55} y={40} width={1} height={1} fill={C["7"]} style={{ animationDelay: "0.4s" }} />
        <rect className="bot-led" x={57} y={40} width={1} height={1} fill={C["7"]} style={{ animationDelay: "0.8s" }} />
        <rect x={66} y={22} width={1} height={1} fill={MINT} />

        {/* hands tapping the keys */}
        <g className="pc-hands">
          <rect x={25} y={26} width={4} height={3} fill={C.K} />
          <rect x={26} y={27} width={2} height={1} fill={C["7"]} />
          <rect x={25} y={29} width={1} height={1} fill={C["8"]} />
          <rect x={27} y={29} width={1} height={1} fill={C["8"]} />
        </g>
        <g className="pc-hands" style={{ animationDelay: "0.17s" }}>
          <rect x={18} y={26} width={4} height={3} fill={C.K} />
          <rect x={19} y={27} width={2} height={1} fill={C["7"]} />
          <rect x={18} y={29} width={1} height={1} fill={C["8"]} />
          <rect x={20} y={29} width={1} height={1} fill={C["8"]} />
        </g>

        {/* data streaming from the head to the code window */}
        {[0, 0.4, 0.8].map((delay, i) => (
          <rect key={i} className="bot-data" x={43} y={12 + i * 2} width={1} height={1} fill={C["8"]} style={{ animationDelay: `${delay}s` }} />
        ))}

        {/* the face */}
        {mode === "shipped" ? (
          <g fill={MINT}>
            <rect x={51} y={13} width={1} height={1} />
            <rect x={52} y={12} width={2} height={1} />
            <rect x={54} y={13} width={1} height={1} />
            <rect x={61} y={13} width={1} height={1} />
            <rect x={62} y={12} width={2} height={1} />
            <rect x={64} y={13} width={1} height={1} />
            <rect x={54} y={16} width={1} height={1} />
            <rect x={55} y={17} width={6} height={1} />
            <rect x={61} y={16} width={1} height={1} />
          </g>
        ) : mode === "building" ? (
          <g fill={C["9"]}>
            <rect x={52} y={13} width={2} height={1} />
            <rect x={62} y={13} width={2} height={1} />
            {[55, 57, 59].map((x) => (
              <rect key={x} x={x} y={16} width={1} height={1} />
            ))}
            {[56, 58].map((x) => (
              <rect key={x} x={x} y={17} width={1} height={1} />
            ))}
          </g>
        ) : (
          <>
            <g className="bot-eyes" fill={C["9"]}>
              <rect x={52 + dx} y={11 + dy} width={2} height={3} />
              <rect x={62 + dx} y={11 + dy} width={2} height={3} />
            </g>
            <rect x={55} y={16} width={5} height={1} fill={C["6"]} />
          </>
        )}

        {/* the code window: code writing itself, then a build bar, then a check */}
        {mode === "shipped" ? (
          <g fill={MINT}>
            {CHECK.map(([x, y]) => (
              <rect key={`${x}-${y}`} x={x} y={y} width={2} height={2} />
            ))}
          </g>
        ) : (
          <>
            {CODE.map(([x, y, w, delay, fill], i) => (
              <rect key={i} className="pc-code" x={x} y={y} width={w} height={1} fill={fill} style={{ animationDelay: `${delay}s` }} />
            ))}
            <rect className="pc-cursor" x={14} y={17} width={1} height={1} fill={C["9"]} />
          </>
        )}
        {mode !== "coding" && (
          <>
            <rect x={5} y={20} width={30} height={3} fill={C["2"]} />
            <rect
              className={mode === "building" ? "bot-progress" : undefined}
              x={6}
              y={21}
              width={28}
              height={1}
              fill={mode === "shipped" ? MINT : C["8"]}
            />
          </>
        )}

        {mode === "shipped" &&
          SPARKS.map(([x, y, drift, delay], i) => (
            <rect
              key={i}
              className="pc-dust"
              x={x}
              y={y}
              width={1}
              height={1}
              fill={i % 2 ? MINT : C["9"]}
              style={{ animationDelay: `${delay}s`, "--dx": `${drift}px` } as React.CSSProperties}
            />
          ))}
      </svg>
      <span className="sr-only" aria-live="polite">
        {status}
      </span>
    </button>
  );
}
