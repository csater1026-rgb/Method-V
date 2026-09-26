// V Coin, Method V's credits: a round pixel coin in the logo's mint with the
// same one-pixel blue drop shadow, stamped with the logo's V in navy. Shown
// wherever credits are (website and app).

import { V_MINT, V_SHADOW, type PixelRect } from "./pixel-v.ts";

// The stamped V: navy, so it stands out on the mint even at text size.
export const COIN_STAMP = "#0b1b2b";

// "#" is the coin, "v" the stamped V (the logo's V_ROWS).
export const COIN_ROWS = [
  "...#####...",
  ".#########.",
  ".#vv###vv#.",
  "##vv###vv##",
  "###vv#vv###",
  "###vv#vv###",
  "####vvv####",
  "#####v#####",
  ".#########.",
  ".#########.",
  "...#####...",
];

// Rects for the coin at `cell` units per pixel: the blue shadow first (one
// pixel down and right), then the mint coin, then the navy V on top.
export function pixelCoinRects(cell = 1): PixelRect[] {
  const layer = (dx: number, dy: number, fill: string, match: (ch: string) => boolean) =>
    COIN_ROWS.flatMap((row, r) => {
      const out: PixelRect[] = [];
      let c = 0;
      while (c < row.length) {
        if (!match(row[c])) {
          c++;
          continue;
        }
        let e = c;
        while (e < row.length && match(row[e])) e++;
        out.push({ x: c * cell + dx, y: r * cell + dy, w: (e - c) * cell, h: cell, fill });
        c = e;
      }
      return out;
    });
  const solid = (ch: string) => ch !== ".";
  return [...layer(cell, cell, V_SHADOW, solid), ...layer(0, 0, V_MINT, solid), ...layer(0, 0, COIN_STAMP, (ch) => ch === "v")];
}

// Width and height in pixels including the shadow.
export const COIN_WIDTH = COIN_ROWS[0].length + 1;
export const COIN_HEIGHT = COIN_ROWS.length + 1;
