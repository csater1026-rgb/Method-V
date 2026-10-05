import { createContext, createElement, useContext } from "react";
import { useColorScheme } from "react-native";

// Same blue, mint, white and cyan palette as the website (src/app/globals.css), dark and
// light. The app follows the phone's setting.
export const palettes = {
  // Charcoal with mint buttons, like the V in the logo (same as the website).
  dark: {
    bg: "#111312",
    surface: "#1a1d1b",
    surface2: "#222624",
    line: "#313733",
    ink: "#f1f5f2",
    muted: "#a3ada6",
    accent: "#82ed9d",
    accentInk: "#0b1b12",
    accentEdge: "#4fb86a",
    heart: "#e5826f",
    danger: "#f08c78",
  },
  light: {
    bg: "#ffffff",
    surface: "#ffffff",
    surface2: "#eef5fc",
    line: "#566a80",
    ink: "#0b1b2b",
    muted: "#56687a",
    accent: "#0379d9",
    accentInk: "#ffffff",
    accentEdge: "#02589f",
    heart: "#c4533f",
    danger: "#b2412f",
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)["dark"]]: string };

export function useColorSchemeName(): "light" | "dark" {
  return useColorScheme() === "light" ? "light" : "dark";
}

// Inside <MediaDark> everything uses the media palette (deep navy) whatever
// the phone is set to, like the website's media-dark. Pass another palette
// (the Spotlight stage passes stageMint in dark mode) to use that instead.
const ForceDark = createContext<Palette | null>(null);

export function MediaDark({ palette, children }: { palette?: Palette; children: React.ReactNode }) {
  return createElement(ForceDark.Provider, { value: palette ?? media }, children);
}

export function useTheme(): Palette {
  const scheme = useColorScheme();
  const forced = useContext(ForceDark);
  if (forced) return forced;
  return scheme !== "light" ? palettes.dark : palettes.light;
}

// The palette for video and posters: \`media\`, or the forced one inside
// <MediaDark palette=…> (so posters on the Spotlight stage match it).
export function useMedia(): Palette {
  return useContext(ForceDark) ?? media;
}

// Poster caps for headlines, a grotesk for text, mono for numbers and tags.
export const fonts = {
  display: "BigShoulders_800ExtraBold",
  body: "SchibstedGrotesk_400Regular",
  bodyMedium: "SchibstedGrotesk_500Medium",
  bodyBold: "SchibstedGrotesk_700Bold",
  mono: "MartianMono_400Regular",
  monoBold: "MartianMono_600SemiBold",
  logo: "Sora_800ExtraBold",
  eyebrow: "Sora_700Bold",
};

// Video, posters and the Spotlight stage: a deep navy with a cyan accent in
// both themes, like the website's media-dark.
export const media: Palette = {
  bg: "#0a1624",
  surface: "#0f2031",
  surface2: "#172b3f",
  line: "#243a50",
  ink: "#ffffff",
  muted: "#9db2c7",
  accent: "#40f4f5",
  accentInk: "#04213a",
  accentEdge: "#1aa9b0",
  heart: "#e5826f",
  danger: "#f08c78",
};

// The Spotlight stage in dark mode: deep mint-tinted greens with the mint
// accent, like the website's --stage-* tokens. Light mode keeps \`media\`.
export const stageMint: Palette = {
  bg: "#0c1611",
  surface: "#13201a",
  surface2: "#1a2a21",
  line: "#24382c",
  ink: "#ffffff",
  muted: "#a3b8aa",
  accent: "#82ed9d",
  accentInk: "#0b1b12",
  accentEdge: "#4fb86a",
  heart: "#e5826f",
  danger: "#f08c78",
};

// Highlight badges (Pro, Launch day…), the same in both themes.
export const MINT = "#82ed9d";
export const MINT_INK = "#0b1b2b";
