// Methodium (Mv), Method V's credits: a made-up element, drawn as a mint
// hexagon token (like a crypto token's badge) with a navy face and the
// symbol "Mv" in mint, sitting on the logo's blue drop shadow. Plain
// shapes on a 64-unit canvas, shared by the website (components/Coin.tsx)
// and the phone app (components/ui.tsx). The letters are strokes, not text,
// so they look the same everywhere and stay bold at text size.

export const MV_VIEW = { width: 64, height: 66 } as const;

// The token's edge, its navy face (a thin rim, so the letters can be big),
// and the shadow's offset (straight down, like the logo).
export const MV_OUTER = "32,2 58,17 58,47 32,62 6,47 6,17";
export const MV_INNER = "32,6.5 54.1,19.25 54.1,44.75 32,57.5 9.9,44.75 9.9,19.25";
export const MV_SHADOW_DY = 3;

// The symbol: a tall M and a smaller v.
export const MV_M = "17,42 17,23.5 24,33.5 31,23.5 31,42";
export const MV_V = "35,29.5 40.5,42 46,29.5";
export const MV_M_WIDTH = 5;
export const MV_V_WIDTH = 4.6;

export const MV_COLORS = {
  shadow: "#0379d9",
  edgeTop: "#d9ffe4",
  edgeBottom: "#2f9e57",
  face: "#0b1b2b",
  symbol: "#82ed9d",
} as const;
