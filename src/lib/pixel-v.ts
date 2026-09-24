// The Method V mark: a pixel V in mint with a one-pixel blue drop shadow.
// Drawn here (not a font letter) so the arms slant to a single-pixel point
// with a crevice down the middle, which keeps it reading as a V.
// Used by the Wordmark (website), the app icon (src/app/icon.svg and
// pixel-icon.ts) and the mobile app's wordmark.

export const V_ROWS = [
  "##...##",
  "##...##",
  ".##.##.",
  ".##.##.",
  "..###..",
  "...#...",
];

export const V_MINT = "#82ed9d";
export const V_SHADOW = "#0379d9";

export type PixelRect = { x: number; y: number; w: number; h: number; fill: string };

// Rects for the V at `cell` units per pixel, top-left at (ox, oy): the blue
// shadow first (one pixel down and right), then the mint V on top.
export function pixelVRects(cell = 1, ox = 0, oy = 0): PixelRect[] {
  const layer = (dx: number, dy: number, fill: string) =>
    V_ROWS.flatMap((row, r) => {
      const out: PixelRect[] = [];
      let c = 0;
      while (c < row.length) {
        if (row[c] !== "#") {
          c++;
          continue;
        }
        let e = c;
        while (e < row.length && row[e] === "#") e++;
        out.push({ x: ox + c * cell + dx, y: oy + r * cell + dy, w: (e - c) * cell, h: cell, fill });
        c = e;
      }
      return out;
    });
  return [...layer(cell, cell, V_SHADOW), ...layer(0, 0, V_MINT)];
}

// Width and height in pixels including the shadow.
export const V_WIDTH = V_ROWS[0].length + 1;
export const V_HEIGHT = V_ROWS.length + 1;
