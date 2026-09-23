import * as Haptics from "expo-haptics";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type TextProps, type ViewStyle } from "react-native";

import { fonts, useTheme } from "@/theme";

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
        borderColor: accent ? t.accent : t.line,
        backgroundColor: accent ? t.accent : t.surface2,
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ fontFamily: fonts.mono, fontSize: 10, textTransform: "uppercase", color: accent ? t.accentInk : t.muted }}>
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

const AVATAR_COLORS = ["#a8c09e", "#d7dfd9", "#d9b38c", "#9fc3cf", "#c7b6d6", "#e2a597", "#c3cf94"];

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
      <Text style={{ fontFamily: fonts.display, fontSize: size * 0.56, color: "#15201a", marginTop: size * 0.06 }}>{letter}</Text>
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
