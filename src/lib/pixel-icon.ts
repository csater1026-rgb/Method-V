// The Method V app icon as a string, for generated PNG icons (home screen,
// Apple touch icon) and the Try it badge: the pixel V from pixel-v.ts on
// black. Generated with scripts/make-icon.mjs; must stay identical to
// src/app/icon.svg (the unit tests check).
export const PIXEL_ICON_SVG =
  '<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 36 36\" shape-rendering=\"crispEdges\"><rect width=\"36\" height=\"36\" rx=\"7\" fill=\"#000000\"/><rect x=\"9\" y=\"10\" width=\"6\" height=\"3\" fill=\"#0379d9\"/><rect x=\"24\" y=\"10\" width=\"6\" height=\"3\" fill=\"#0379d9\"/><rect x=\"9\" y=\"13\" width=\"6\" height=\"3\" fill=\"#0379d9\"/><rect x=\"24\" y=\"13\" width=\"6\" height=\"3\" fill=\"#0379d9\"/><rect x=\"12\" y=\"16\" width=\"6\" height=\"3\" fill=\"#0379d9\"/><rect x=\"21\" y=\"16\" width=\"6\" height=\"3\" fill=\"#0379d9\"/><rect x=\"12\" y=\"19\" width=\"6\" height=\"3\" fill=\"#0379d9\"/><rect x=\"21\" y=\"19\" width=\"6\" height=\"3\" fill=\"#0379d9\"/><rect x=\"15\" y=\"22\" width=\"9\" height=\"3\" fill=\"#0379d9\"/><rect x=\"18\" y=\"25\" width=\"3\" height=\"3\" fill=\"#0379d9\"/><rect x=\"6\" y=\"7\" width=\"6\" height=\"3\" fill=\"#82ed9d\"/><rect x=\"21\" y=\"7\" width=\"6\" height=\"3\" fill=\"#82ed9d\"/><rect x=\"6\" y=\"10\" width=\"6\" height=\"3\" fill=\"#82ed9d\"/><rect x=\"21\" y=\"10\" width=\"6\" height=\"3\" fill=\"#82ed9d\"/><rect x=\"9\" y=\"13\" width=\"6\" height=\"3\" fill=\"#82ed9d\"/><rect x=\"18\" y=\"13\" width=\"6\" height=\"3\" fill=\"#82ed9d\"/><rect x=\"9\" y=\"16\" width=\"6\" height=\"3\" fill=\"#82ed9d\"/><rect x=\"18\" y=\"16\" width=\"6\" height=\"3\" fill=\"#82ed9d\"/><rect x=\"12\" y=\"19\" width=\"9\" height=\"3\" fill=\"#82ed9d\"/><rect x=\"15\" y=\"22\" width=\"3\" height=\"3\" fill=\"#82ed9d\"/></svg>';

// Full-bleed version for home screens, which add their own rounded corners.
export const PIXEL_ICON_SQUARE_SVG = PIXEL_ICON_SVG.replace(' rx="7"', "");

// The icon's viewBox size, for drawing it inside other SVGs.
export const PIXEL_ICON_SIZE = 36;
