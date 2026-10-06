// The V Store's item pictures: one bold dark object per item, with bright
// details cut into it, no box around it (like the item art in a game shop).
// Plain shapes on a 64-unit canvas, shared by the website
// (components/VStore.tsx) and the phone app (app/store.tsx), so both draw the
// same thing. "main" is the dark ink (--shop-badge), "detail" the bright
// accent (--shop-badge-ink): mint in dark mode, blue in light mode. A shape
// can also use a fixed color, like the Method V logo's mint and blue.

import { V_HEIGHT, V_WIDTH, pixelVRects } from "./pixel-v";

export type ShopIconName = "verified" | "podium" | "layers" | "medal" | "sale" | "tipjar";

export type ShopPaint = "main" | "detail" | `#${string}`;

// The color to draw a paint with, given this theme's main and detail colors.
export const shopColor = (paint: ShopPaint, main: string, detail: string) => (paint === "main" ? main : paint === "detail" ? detail : paint);

export type ShopShape = {
  el: "path" | "polygon" | "rect" | "circle" | "ellipse" | "text";
  // Geometry and stroke settings, named the same way for React DOM's SVG and
  // react-native-svg (strokeWidth, textAnchor…).
  attrs: Record<string, string | number>;
  fill?: ShopPaint;
  stroke?: ShopPaint;
  opacity?: number;
  text?: string;
};

// A star or burst: n points, alternating between radius R and r.
function burst(cx: number, cy: number, R: number, r: number, n: number) {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const k = i % 2 ? r : R;
    pts.push(`${(cx + k * Math.cos(a)).toFixed(2)},${(cy + k * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(" ");
}

const ROUND = { strokeLinejoin: "round", strokeLinecap: "round" } as const;

// A "%" drawn from shapes (two rings and a slash), so it looks the same on
// every device.
function percent(cx: number, cy: number, s: number, paint: ShopPaint): ShopShape[] {
  const o = s * 0.3;
  return [
    { el: "circle", attrs: { cx: cx - o, cy: cy - o, r: s * 0.17, strokeWidth: s * 0.12 }, stroke: paint },
    { el: "circle", attrs: { cx: cx + o, cy: cy + o, r: s * 0.17, strokeWidth: s * 0.12 }, stroke: paint },
    {
      el: "path",
      attrs: { d: `M${cx + s * 0.42} ${cy - s * 0.48} L${cx - s * 0.42} ${cy + s * 0.48}`, strokeWidth: s * 0.13, ...ROUND },
      stroke: paint,
    },
  ];
}

// The logo's pixel size inside the Pro rosette.
const V_CELL = 3.5;

export const SHOP_ICONS: Record<ShopIconName, ShopShape[]> = {
  // Pro: a verified rosette with the Method V logo (the pixel V in its own
  // mint and blue) in the middle.
  verified: [
    { el: "polygon", attrs: { points: burst(32, 32, 28, 24, 14), strokeWidth: 2, ...ROUND }, fill: "main", stroke: "main" },
    ...pixelVRects(V_CELL, 32 - (V_WIDTH * V_CELL) / 2, 32 - (V_HEIGHT * V_CELL) / 2).map(
      ({ x, y, w, h, fill }): ShopShape => ({ el: "rect", attrs: { x, y, width: w, height: h }, fill: fill as ShopPaint }),
    ),
  ],
  // The Spotlight: the top step of a podium, with a star over it.
  podium: [
    { el: "rect", attrs: { x: 4, y: 35, width: 18, height: 24, rx: 2 }, fill: "main", opacity: 0.6 },
    { el: "rect", attrs: { x: 23, y: 22, width: 18, height: 37, rx: 2 }, fill: "main" },
    { el: "rect", attrs: { x: 42, y: 42, width: 18, height: 17, rx: 2 }, fill: "main", opacity: 0.6 },
    { el: "path", attrs: { d: "M27.5 32 L33.5 28 H36.5 V48 H32 V33.5 L27.5 36 Z", strokeWidth: 0.8, ...ROUND }, fill: "detail", stroke: "detail" },
    { el: "polygon", attrs: { points: burst(32, 11, 8, 3.4, 5), strokeWidth: 1, ...ROUND }, fill: "main", stroke: "main" },
  ],
  // An extra app post: a stack of layers and a plus.
  layers: [
    { el: "path", attrs: { d: "M6 40 L32 52 L58 40", strokeWidth: 5, ...ROUND }, stroke: "main", opacity: 0.55 },
    { el: "path", attrs: { d: "M6 30 L32 42 L58 30", strokeWidth: 5, ...ROUND }, stroke: "main", opacity: 0.8 },
    { el: "polygon", attrs: { points: "32,6 58,19 32,32 6,19", strokeWidth: 2, ...ROUND }, fill: "main", stroke: "main" },
    { el: "circle", attrs: { cx: 49, cy: 49, r: 12 }, fill: "main" },
    { el: "path", attrs: { d: "M49 43 V55 M43 49 H55", strokeWidth: 3.6, ...ROUND }, stroke: "detail" },
  ],
  // Bounties: a medal on a ribbon.
  medal: [
    { el: "polygon", attrs: { points: "16,3 29,3 38,27 25,27" }, fill: "main", opacity: 0.6 },
    { el: "polygon", attrs: { points: "48,3 35,3 26,27 39,27" }, fill: "main", opacity: 0.85 },
    { el: "circle", attrs: { cx: 32, cy: 42, r: 18 }, fill: "main" },
    { el: "circle", attrs: { cx: 32, cy: 42, r: 12 }, fill: "detail" },
    { el: "polygon", attrs: { points: burst(32, 42.5, 8, 3.4, 5), strokeWidth: 1, ...ROUND }, fill: "main", stroke: "main" },
  ],
  // Perks: a sale burst with a %.
  sale: [
    { el: "polygon", attrs: { points: burst(32, 32, 29, 22, 12), strokeWidth: 2, ...ROUND }, fill: "main", stroke: "main" },
    ...percent(32, 32, 22, "detail"),
  ],
  // Tips: a tip jar with a coin going in.
  tipjar: [
    { el: "circle", attrs: { cx: 38, cy: 7, r: 5.5 }, fill: "main" },
    { el: "rect", attrs: { x: 14, y: 13, width: 36, height: 7, rx: 2 }, fill: "main" },
    {
      el: "path",
      attrs: { d: "M16 20 H48 C52 23 54 27 54 32 V52 C54 56 52 59 48 59 H16 C12 59 10 56 10 52 V32 C10 27 12 23 16 20Z" },
      fill: "main",
    },
    { el: "rect", attrs: { x: 17, y: 31, width: 30, height: 17, rx: 3 }, fill: "detail" },
    { el: "text", attrs: { x: 32, y: 44, fontSize: 11, fontWeight: 900, textAnchor: "middle" }, fill: "main", text: "TIPS" },
  ],
};

// The soft shadow each object sits on.
export const SHOP_ICON_SHADOW = { cx: 32, cy: 63, rx: 18, ry: 2.6, opacity: 0.16 } as const;
