// An app's logo when its builder hasn't added one: the app's first letter on
// a two-color gradient picked from its name, so the same app always gets the
// same colors. These are the apps' own colors, not the site's theme, so
// they're the same in light and dark mode. Shared by the website
// (components/AppLogo.tsx) and the phone app (components/AppCard.tsx).

export const LOGO_GRADIENTS: readonly (readonly [string, string])[] = [
  ["#7c7bff", "#4338ca"], // indigo
  ["#ff5d8f", "#ff9a3c"], // pink to orange
  ["#34d399", "#059669"], // green
  ["#38bdf8", "#0369a1"], // sky
  ["#f472b6", "#9333ea"], // pink to purple
  ["#fbbf24", "#ea580c"], // amber
  ["#2dd4bf", "#0f766e"], // teal
  ["#fb7185", "#be123c"], // rose
];

// A well-mixed hash of the name (FNV-1a, then a finishing scramble), so
// similar names still land on different colors.
export function logoGradient(name: string): readonly [string, string] {
  let h = 0x811c9dc5;
  for (const ch of name.trim().toLowerCase()) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return LOGO_GRADIENTS[(h >>> 0) % LOGO_GRADIENTS.length];
}

// The first letter or digit of the name (any alphabet), else its first
// character, else "?".
export function logoLetter(name: string): string {
  const chars = [...name.trim()];
  const letter = chars.find((c) => /[0-9]/.test(c) || c.toLowerCase() !== c.toUpperCase());
  return (letter ?? chars[0] ?? "?").toUpperCase();
}

// Logos are uploaded as square JPEGs this many pixels wide.
export const LOGO_SIZE = 256;
