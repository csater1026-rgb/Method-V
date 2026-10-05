// Methodium (Mv), Method V's credits: a made-up element, drawn as a
// periodic-table tile in the logo's mint with the same one-pixel blue drop
// shadow, its symbol "Mv" in mint on a navy face. Shown wherever credits are
// (website and app).

import { V_MINT, V_SHADOW, type PixelRect } from "./pixel-v.ts";

// The tile's face: navy, so the mint symbol stands out even at text size.
export const COIN_STAMP = "#0b1b2b";

// "#" is mint (the tile's edge and the letters), "k" the navy face.
export const COIN_ROWS = [
  "#############",
  "#kkkkkkkkkkk#",
  "#k#kkk#kkkkk#",
  "#k##k##kkkkk#",
  "#k#k#k#k#k#k#",
  "#k#kkk#k#k#k#",
  "#k#kkk#kk#kk#",
  "#kkkkkkkkkkk#",
  "#############",
];

// Rects for the tile at `cell` units per pixel: the blue shadow first (one
// pixel down and right), then the mint tile, then the navy face on top.
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
  return [...layer(cell, cell, V_SHADOW, solid), ...layer(0, 0, V_MINT, solid), ...layer(0, 0, COIN_STAMP, (ch) => ch === "k")];
}

// Width and height in pixels including the shadow.
export const COIN_WIDTH = COIN_ROWS[0].length + 1;
export const COIN_HEIGHT = COIN_ROWS.length + 1;
