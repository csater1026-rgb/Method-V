import { Image } from "expo-image";
import { Link } from "expo-router";
import { useId } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { logoGradient, logoLetter } from "@shared/app-logo";
import { CATEGORIES, labelFor } from "@shared/constants";
import { formatCount } from "@shared/format";
import type { AppCard as Card } from "@shared/types";

import { fonts, useMedia, useTheme } from "@/theme";

import { TryCount } from "./TryCount";
import { Avatar, Body, Display, Handle, Mono, Tag } from "./ui";

// A striped stand-in when there's no poster (like the website's).
export function DropPlaceholder({ name, compact, bare }: { name: string; compact?: boolean; bare?: boolean }) {
  const media = useMedia();
  return (
    // Full-screen placeholders put the name in the middle, clear of the caption.
    <View style={{ flex: 1, overflow: "hidden", backgroundColor: media.surface, justifyContent: compact ? "flex-end" : "center", alignItems: compact ? "flex-start" : "center", padding: compact ? 10 : 24 }}>
      <View style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        {Array.from({ length: 60 }, (_, i) => (
          <View
            key={i}
            style={{ position: "absolute", left: -700 + i * 26, top: -300, width: 12, height: 2000, backgroundColor: media.surface2, transform: [{ rotate: "35deg" }] }}
          />
        ))}
      </View>
      {!bare && (
        <Display size={compact ? 28 : 56} style={{ color: media.ink, textAlign: compact ? "left" : "center" }} numberOfLines={2}>
          {name}
        </Display>
      )}
    </View>
  );
}

export function AppCard({ app, wide }: { app: Card; wide?: boolean }) {
  const t = useTheme();
  const media = useMedia();
  return (
    <Link href={`/apps/${app.slug}`} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${app.name}: ${app.tagline}`}
        style={({ pressed }) => ({
          width: wide ? 260 : undefined,
          backgroundColor: t.surface,
          borderColor: pressed ? t.accent : t.line,
          borderWidth: 1,
          borderRadius: 12,
          overflow: "hidden",
        })}
      >
        <View style={{ aspectRatio: wide ? 4 / 3 : 16 / 9, backgroundColor: media.bg }}>
          {app.poster_url ? (
            <Image source={{ uri: app.poster_url }} style={{ flex: 1 }} contentFit="cover" transition={150} />
          ) : (
            <DropPlaceholder name={app.name} compact />
          )}
        </View>
        <View style={{ padding: 12, gap: 6 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Tag>{labelFor(CATEGORIES, app.category)}</Tag>
          </View>
          <Display size={26} numberOfLines={1}>
            {app.name}
          </Display>
          <Body muted size={13} numberOfLines={2}>
            {app.tagline}
          </Body>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 2 }}>
            <Avatar username={app.owner.username} name={app.owner.display_name} src={app.owner.avatar_url} size={20} />
            <Body size={12} muted numberOfLines={1} style={{ flex: 1 }}>
              {app.owner.display_name || <Handle username={app.owner.username} size={12} />}
            </Body>
            <Mono>
              <TryCount appId={app.id} count={app.try_count} /> tries
            </Mono>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

// An app's logo: the square picture its builder added, or else its first
// letter on its own colors (the website's src/lib/app-logo.ts). `ring` draws
// a border in that color, for a logo sitting over a picture.
export function AppLogo({ name, src, size, ring }: { name: string; src: string | null; size: number; ring?: string }) {
  const id = `applogo${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const radius = Math.round(size * 0.24);
  const [from, to] = logoGradient(name);
  const logo = src ? (
    <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: radius, backgroundColor: "#ffffff" }} contentFit="cover" transition={150} />
  ) : (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={from} />
            <Stop offset="1" stopColor={to} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={size} height={size} rx={radius} fill={`url(#${id})`} />
      </Svg>
      <View style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: fonts.display, color: "#ffffff", fontSize: Math.round(size * 0.56), includeFontPadding: false }}>{logoLetter(name)}</Text>
      </View>
    </View>
  );
  if (!ring) return logo;
  return <View style={{ padding: 4, borderRadius: radius + 4, backgroundColor: ring, alignSelf: "flex-start" }}>{logo}</View>;
}

// The card for Home's rows (Featured, Just posted), Browse and profiles, like
// the website's: the app's picture as a wide banner, then the name, tagline
// and builder (or, on a profile, its likes). `compact` for 2 across.
export function AppBannerCard({
  app,
  width = 260,
  showOwner = true,
  compact = false,
}: {
  app: Card;
  width?: number | "100%";
  showOwner?: boolean;
  compact?: boolean;
}) {
  const t = useTheme();
  const media = useMedia();
  return (
    <Link href={`/apps/${app.slug}`} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${app.name}: ${app.tagline}`}
        style={({ pressed }) => ({ width, backgroundColor: t.surface, borderColor: pressed ? t.accent : t.line, borderWidth: 1, borderRadius: 12, overflow: "hidden" })}
      >
        <View style={{ aspectRatio: 16 / 9, backgroundColor: media.bg }}>
          {app.poster_url ? (
            <Image source={{ uri: app.poster_url }} style={{ flex: 1 }} contentFit="cover" transition={150} />
          ) : (
            <DropPlaceholder name={app.name} compact bare />
          )}
        </View>
        <View style={{ paddingHorizontal: compact ? 10 : 12, paddingBottom: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
            <Display size={compact ? 22 : 26} numberOfLines={1} style={{ flexShrink: 1 }}>
              {app.name}
            </Display>
            {!compact && <Tag>{labelFor(CATEGORIES, app.category)}</Tag>}
          </View>
          <Body muted size={13} numberOfLines={1}>
            {app.tagline}
          </Body>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 }}>
            {showOwner ? (
              <>
                <Avatar username={app.owner.username} name={app.owner.display_name} src={app.owner.avatar_url} size={18} />
                {compact ? (
                  <View style={{ flex: 1 }} />
                ) : (
                  <Body size={12} muted numberOfLines={1} style={{ flex: 1 }}>
                    {app.owner.display_name || <Handle username={app.owner.username} size={12} />}
                  </Body>
                )}
              </>
            ) : (
              <View style={{ flex: 1 }} />
            )}
            <Mono>
              <TryCount appId={app.id} count={app.try_count} /> tries{showOwner ? "" : ` · ${formatCount(app.like_count)} ♥`}
            </Mono>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}
