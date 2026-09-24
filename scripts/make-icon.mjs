// Writes src/app/icon.svg and src/lib/pixel-icon.ts from the pixel V in
// src/lib/pixel-v.ts: the V (with its shadow) centered on black.
//
//   node --experimental-strip-types scripts/make-icon.mjs

import { writeFileSync } from "node:fs";

import { V_HEIGHT, V_WIDTH, pixelVRects } from "../src/lib/pixel-v.ts";

// A 36-unit square with 3 units per pixel keeps every edge on whole units
// and leaves the V about two-thirds of the icon's width.
const size = 36;
const cell = 3;
const ox = Math.floor((size - V_WIDTH * cell) / 2);
const oy = Math.floor((size - V_HEIGHT * cell) / 2);
const rects = pixelVRects(cell, ox, oy)
  .map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.fill}"/>`)
  .join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" rx="7" fill="#000000"/>${rects}</svg>`;

writeFileSync(new URL("../src/app/icon.svg", import.meta.url), `${svg}\n`);
writeFileSync(
  new URL("../src/lib/pixel-icon.ts", import.meta.url),
  `// The Method V app icon as a string, for generated PNG icons (home screen,
// Apple touch icon) and the Try it badge: the pixel V from pixel-v.ts on
// black. Generated with scripts/make-icon.mjs; must stay identical to
// src/app/icon.svg (the unit tests check).
export const PIXEL_ICON_SVG =
  ${JSON.stringify(svg).replace(/^"|"$/g, "'")};

// Full-bleed version for home screens, which add their own rounded corners.
export const PIXEL_ICON_SQUARE_SVG = PIXEL_ICON_SVG.replace(' rx="7"', "");

// The icon's viewBox size, for drawing it inside other SVGs.
export const PIXEL_ICON_SIZE = ${size};
`,
);
console.log("wrote src/app/icon.svg and src/lib/pixel-icon.ts");
