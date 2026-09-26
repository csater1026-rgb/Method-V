import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type TextProps, type ViewStyle } from "react-native";
import Svg, { Rect } from "react-native-svg";

import { OFFICIAL_HANDLE, ROLES, labelFor, primaryStatus } from "@shared/constants";
import { COIN_HEIGHT, COIN_WIDTH, pixelCoinRects } from "@shared/pixel-coin";
import { V_HEIGHT, V_WIDTH, pixelVRects } from "@shared/pixel-v";

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

// Small label above a title ("What builders shipped"): the logo's font, bold,
// spaced-out capitals in the accent color. Same as the website's .eyebrow.
export function Eyebrow({ style, ...rest }: TextProps) {
  const t = useTheme();
  return (
    <Text
      style={[{ fontFamily: fonts.eyebrow, fontSize: 11.5, letterSpacing: 1.6, textTransform: "uppercase", color: t.accent }, style]}
      {...rest}
    />
  );
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

// Same as the website's avatars: the builder's photo, or a colored circle
// with their first letter.
export function Avatar({ username, name, src, size = 40 }: { username: string; name?: string; src?: string | null; size?: number }) {
  if (src) {
    return (
      <Image
        source={{ uri: src }}
        accessibilityIgnoresInvertColors
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#172b3f" }}
        contentFit="cover"
        transition={120}
      />
    );
  }
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

// The status people message about (Hiring, Looking for work…), shown next to
// someone's avatar. Same rule as the website's StatusBadge.
export function StatusBadge({ roles }: { roles: readonly string[] }) {
  const status = primaryStatus(roles);
  return status ? <Tag tone="accent">{labelFor(ROLES, status)}</Tag> : null;
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  return <View style={[{ backgroundColor: t.surface, borderColor: t.line, borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: 12, padding: 14 }, style]}>{children}</View>;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return children ? <Body style={{ color: t.danger }} size={13}>{children}</Body> : null;
}

// "METHOD" in the logo font, then the pixel V (mint, blue pixel shadow),
// the same as the website's Wordmark. The V's shape comes from the website's
// src/lib/pixel-v.ts.
const V_PIXELS = pixelVRects();

export function Wordmark({ size = 22 }: { size?: number }) {
  const t = useTheme();
  const vHeight = size * 0.84;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel="Method V" style={{ flexDirection: "row", alignItems: "center" }}>
      <Text style={{ fontFamily: fonts.logo, fontSize: size, lineHeight: size * 1.1, color: t.ink, textTransform: "uppercase", letterSpacing: -0.2 }}>Method</Text>
      <Svg width={(vHeight * V_WIDTH) / V_HEIGHT} height={vHeight} viewBox={`0 0 ${V_WIDTH} ${V_HEIGHT}`} style={{ marginLeft: size * 0.2, marginTop: size * 0.12 }}>
        {V_PIXELS.map((r, i) => (
          <Rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
        ))}
      </Svg>
    </View>
  );
}

// Someone's @handle, inside a text. Method V's own account ends in the logo's
// pixel V, sized to the text around it (pass that text's font size).
export function Handle({ username, size = 15 }: { username: string; size?: number }) {
  if (username !== OFFICIAL_HANDLE) return <>@{username}</>;
  const h = size * 0.8;
  return (
    <>
      @{OFFICIAL_HANDLE.slice(0, -1)}
      <Svg width={(h * V_WIDTH) / V_HEIGHT} height={h} viewBox={`0 0 ${V_WIDTH} ${V_HEIGHT}`} accessibilityLabel="v">
        {V_PIXELS.map((r, i) => (
          <Rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
        ))}
      </Svg>
    </>
  );
}

// The credit coin (mint, stamped with the logo's V), the same as the
// website's. Drawn from the website's src/lib/pixel-coin.ts.
const COIN_PIXELS = pixelCoinRects();

export function Coin({ size = 14 }: { size?: number }) {
  return (
    <Svg width={(size * COIN_WIDTH) / COIN_HEIGHT} height={size} viewBox={`0 0 ${COIN_WIDTH} ${COIN_HEIGHT}`} accessible={false}>
      {COIN_PIXELS.map((r, i) => (
        <Rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} fill={r.fill} />
      ))}
    </Svg>
  );
}
