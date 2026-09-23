import { Image } from "expo-image";
import { Link } from "expo-router";
import { Pressable, View } from "react-native";

import { CATEGORIES, labelFor } from "@shared/constants";
import { formatCount } from "@shared/format";
import type { AppCard as Card } from "@shared/types";

import { media, useTheme } from "@/theme";

import { Avatar, Body, Display, Mono, Tag } from "./ui";

// A striped stand-in when there's no poster (like the website's).
export function DropPlaceholder({ name, compact }: { name: string; compact?: boolean }) {
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
      <Display size={compact ? 28 : 56} style={{ color: media.ink, textAlign: compact ? "left" : "center" }} numberOfLines={2}>
        {name}
      </Display>
    </View>
  );
}

export function AppCard({ app, wide }: { app: Card; wide?: boolean }) {
  const t = useTheme();
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
            <Avatar username={app.owner.username} name={app.owner.display_name} size={20} />
            <Body size={12} muted numberOfLines={1} style={{ flex: 1 }}>
              {app.owner.display_name || `@${app.owner.username}`}
            </Body>
            <Mono>{formatCount(app.try_count)} tries</Mono>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}
