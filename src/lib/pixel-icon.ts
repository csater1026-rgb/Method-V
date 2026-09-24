// The Method V app icon as a string, for generated PNG icons (home screen,
// Apple touch icon) and the Try it badge: the logo's mint pixel V with its
// blue pixel shadow, on black. Must stay identical to src/app/icon.svg; the
// unit tests check it.
export const PIXEL_ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" shape-rendering="crispEdges"><rect width="32" height="32" rx="6" fill="#000000"/><rect x="8" y="10" width="6" height="3" fill="#0379d9"/><rect x="20" y="10" width="6" height="3" fill="#0379d9"/><rect x="8" y="13" width="6" height="3" fill="#0379d9"/><rect x="20" y="13" width="6" height="3" fill="#0379d9"/><rect x="11" y="16" width="12" height="3" fill="#0379d9"/><rect x="11" y="19" width="12" height="3" fill="#0379d9"/><rect x="14" y="22" width="6" height="3" fill="#0379d9"/><rect x="5" y="7" width="6" height="3" fill="#82ed9d"/><rect x="17" y="7" width="6" height="3" fill="#82ed9d"/><rect x="5" y="10" width="6" height="3" fill="#82ed9d"/><rect x="17" y="10" width="6" height="3" fill="#82ed9d"/><rect x="8" y="13" width="12" height="3" fill="#82ed9d"/><rect x="8" y="16" width="12" height="3" fill="#82ed9d"/><rect x="11" y="19" width="6" height="3" fill="#82ed9d"/></svg>';

// Full-bleed version for home screens, which add their own rounded corners.
export const PIXEL_ICON_SQUARE_SVG = PIXEL_ICON_SVG.replace(' rx="6"', "");
