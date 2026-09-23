import { useColorScheme } from "react-native";

// Same blue, mint, white and cyan palette as the website (src/app/globals.css), dark and
// light. The app follows the phone's setting.
export const palettes = {
  dark: {
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
  },
  light: {
    bg: "#ffffff",
    surface: "#ffffff",
    surface2: "#eef5fc",
    line: "#d9e5f1",
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

export function useTheme(): Palette {
  return useColorScheme() === "light" ? palettes.light : palettes.dark;
}

// Poster caps for headlines, a grotesk for text, mono for numbers and tags.
export const fonts = {
  display: "BigShoulders_800ExtraBold",
  body: "SchibstedGrotesk_400Regular",
  bodyMedium: "SchibstedGrotesk_500Medium",
  bodyBold: "SchibstedGrotesk_700Bold",
  mono: "MartianMono_400Regular",
  monoBold: "MartianMono_600SemiBold",
};

// Video and posters stay dark in both themes, like the website's media-dark.
export const media = palettes.dark;

// Highlight badges (Pro, Launch day…), the same in both themes.
export const MINT = "#82ed9d";
export const MINT_INK = "#0b1b2b";
