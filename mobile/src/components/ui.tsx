import * as Haptics from "expo-haptics";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type TextProps, type ViewStyle } from "react-native";

import { MINT, MINT_INK, fonts, useTheme } from "@/theme";

export function Display({ style, children, size = 40, ...rest }: TextProps & { size?: number }) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      style={[{ fontFamily: fonts.display, fontSize: size, lineHeight: size * 0.95, color: t.ink, textTransform: "uppercase" }, style]}
    >
      {children}
    </Text>
  );
}

export function Body({ style, muted, bold, size = 15, ...rest }: TextProps & { muted?: boolean; bold?: boolean; size?: number }) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      style={[{ fontFamily: bold ? fonts.bodyBold : fonts.body, fontSize: size, lineHeight: size * 1.4, color: muted ? t.muted : t.ink }, style]}
    />
  );
}

export function Mono({ style, muted = true, size = 11, ...rest }: TextProps & { muted?: boolean; size?: number }) {
  const t = useTheme();
  return <Text {...rest} style={[{ fontFamily: fonts.mono, fontSize: size, color: muted ? t.muted : t.ink, letterSpacing: 0.5 }, style]} />;
}

export function Tag({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "accent" }) {
  const t = useTheme();
  const accent = tone === "accent";
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: accent ? MINT : t.line,
        backgroundColor: accent ? MINT : t.surface2,
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ fontFamily: fonts.mono, fontSize: 10, textTransform: "uppercase", color: accent ? MINT_INK : t.muted }}>
        {children}
      </Text>
    </View>
  );
}

export function tap() {
  if (Platform.OS !== "web") void Haptics.selectionAsync();
}

export function Button({
  label,
  onPress,
  kind = "accent",
  disabled,
  busy,
  style,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  kind?: "accent" | "ghost";
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const accent = kind === "accent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: disabled || busy }}
      disabled={disabled || busy}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        {
          minHeight: 44,
          paddingHorizontal: 18,
          borderRadius: 8,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: 8,
          backgroundColor: accent ? t.accent : "transparent",
          borderWidth: accent ? 0 : 1,
          borderColor: t.line,
          borderBottomWidth: accent ? 3 : 1,
          borderBottomColor: accent ? t.accentEdge : t.line,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ translateY: pressed ? 1 : 0 }],
        },
        style,
      ]}
    >
      {busy && <ActivityIndicator size="small" color={accent ? t.accentInk : t.ink} />}
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, color: accent ? t.accentInk : t.ink }}>{label}</Text>
    </Pressable>
  );
}

const AVATAR_COLORS = ["#82ed9d", "#9fd8fb", "#d9b38c", "#40f4f5", "#c7b6d6", "#e2a597", "#b8f3c8"];

// Same colors and letters as the website's avatars.
export function Avatar({ username, name, size = 40 }: { username: string; name?: string; size?: number }) {
  let hash = 0;
  for (const ch of username) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const letter = (name || username).trim().charAt(0).toUpperCase() || "?";
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: AVATAR_COLORS[hash % AVATAR_COLORS.length], alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontFamily: fonts.display, fontSize: size * 0.56, color: "#0b1b2b", marginTop: size * 0.06 }}>{letter}</Text>
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: 12, padding: 14 }, style]}>{children}</View>;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return children ? <Body style={{ color: t.danger }} size={13}>{children}</Body> : null;
}

// "METHOD V" in the pixel logo font, with the mint V and its blue pixel
// shadow (same as the website's Wordmark).
export function Wordmark({ size = 22 }: { size?: number }) {
  const t = useTheme();
  return (
    <Text accessibilityRole="header" accessibilityLabel="Method V" style={{ fontFamily: fonts.logo, fontSize: size, color: t.ink, textTransform: "uppercase" }}>
      Method{" "}
      <Text style={{ color: MINT, textShadowColor: "#0379d9", textShadowOffset: { width: size * 0.125, height: size * 0.125 }, textShadowRadius: 0 }}>V</Text>
    </Text>
  );
}
