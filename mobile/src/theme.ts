import { useColorScheme } from "react-native";

// Same sage-and-cream palette as the website (src/app/globals.css), dark and
// light. The app follows the phone's setting.
export const palettes = {
  dark: {
    bg: "#121814",
    surface: "#19211b",
    surface2: "#222c25",
    line: "#34413a",
    ink: "#efe8d8",
    muted: "#a3ab9d",
    accent: "#a8c09e",
    accentInk: "#112014",
    accentEdge: "#6f8a66",
    heart: "#e5826f",
    danger: "#f08c78",
  },
  light: {
    bg: "#f3eee2",
    surface: "#fbf8f1",
    surface2: "#e9e2d2",
    line: "#d6cdb9",
    ink: "#1e2a21",
    muted: "#5c6757",
    accent: "#4a6a4e",
    accentInk: "#f7f2e7",
    accentEdge: "#2f4833",
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
