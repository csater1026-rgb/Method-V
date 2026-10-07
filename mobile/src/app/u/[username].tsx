import { Image } from "expo-image";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";

import { ROLES, labelFor, primaryStatus } from "@shared/constants";
import { formatCount, formatDuration } from "@shared/format";
import { socialLinks } from "@shared/socials";

import { AppBannerCard, DropPlaceholder } from "@/components/AppCard";
import { Loading } from "@/components/Loading";
import { Avatar, Body, Button, Display, ErrorText, Handle, Mono, StatusBadge, Tag } from "@/components/ui";
import { SITE_URL, fileUrl } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { getProfileBundle, setFollow } from "@/lib/data";
import { useLoad } from "@/lib/useLoad";
import { media, useTheme } from "@/theme";

export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const t = useTheme();
  const router = useRouter();
  const { viewer } = useAuth();
  const { data, error, refreshing, reload } = useLoad(
    async () => {
      const found = await getProfileBundle(String(username).toLowerCase(), viewer?.id ?? null);
      // Throwing (not returning null) shows "not found" instead of a spinner.
      if (!found) throw new Error("There's no builder with that username.");
      return found;
    },
    [username, viewer?.id],
  );
  const [following, setFollowing] = useState<boolean | null>(null);
  const [followError, setFollowError] = useState<string | null>(null);

  if (data === null && !error) return <Loading />;
  if (!data) {
    return (
      <View style={{ flex: 1, padding: 24, backgroundColor: t.bg }}>
        <Display size={36}>Builder not found</Display>
        <ErrorText>{error}</ErrorText>
      </View>
    );
  }
  const { profile, apps, drops } = data;
  const isSelf = viewer?.id === profile.id;
  const isFollowing = following ?? data.following;
  const pro = Boolean(profile.pro_until && Date.parse(profile.pro_until) > Date.now());

  async function toggleFollow() {
    if (!viewer) return router.push("/sign-in");
    const next = !isFollowing;
    setFollowing(next);
    setFollowError(null);
    const r = await setFollow(profile.id, next);
    if (!r.ok) {
      setFollowing(!next);
      setFollowError(r.error);
    }
  }

  const cover = fileUrl(profile.cover_path ?? null);

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={t.muted} />}
    >
      <Stack.Screen options={{ title: `@${profile.username}` }} />
      {/* Their header picture, behind their photo: only on their profile. */}
      {cover ? (
        <Image
          source={{ uri: cover }}
          accessibilityIgnoresInvertColors
          style={{ width: "100%", aspectRatio: 3, borderRadius: 12, backgroundColor: t.surface }}
          contentFit="cover"
        />
      ) : null}
      {/* Photo with the status people message about right next to it. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: cover ? -48 : 0, paddingHorizontal: cover ? 12 : 0 }}>
        <View style={cover ? { borderRadius: 999, padding: 3, backgroundColor: t.bg } : undefined}>
          <Avatar username={profile.username} name={profile.display_name} src={fileUrl(profile.avatar_path)} size={84} />
        </View>
        <View>
          <StatusBadge roles={profile.roles} />
        </View>
      </View>
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Display size={46} style={{ flexShrink: 1 }}>
            {profile.display_name || <Handle username={profile.username} size={46} />}
          </Display>
          {pro && <Tag tone="accent">Pro</Tag>}
        </View>
        <Body muted>
          <Handle username={profile.username} />
        </Body>
        {/* Their socials, right under their name. */}
        {socialLinks(profile).length > 0 && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {socialLinks(profile).map((l) => (
              <Pressable
                key={l.key}
                accessibilityRole="link"
                accessibilityLabel={`${l.label} ${l.text}`}
                onPress={() => void Linking.openURL(l.href)}
                style={{ flexDirection: "row", gap: 6, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 5 }}
              >
                <Body bold size={12}>
                  {l.label}
                </Body>
                {l.text !== l.label && (
                  <Body muted size={12}>
                    {l.text}
                  </Body>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </View>
      {profile.roles.some((r) => r !== primaryStatus(profile.roles)) && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {profile.roles.filter((r) => r !== primaryStatus(profile.roles)).map((r) => (
            <Tag key={r} tone={r === "hiring" || r === "looking_for_work" ? "accent" : "plain"}>
              {labelFor(ROLES, r)}
            </Tag>
          ))}
        </View>
      )}
      {profile.bio ? <Body>{profile.bio}</Body> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push({ pathname: "/follows", params: { username: profile.username, kind: "followers" } })}>
          <Mono muted={false}>{formatCount(profile.follower_count)} followers</Mono>
        </Pressable>
        <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push({ pathname: "/follows", params: { username: profile.username, kind: "following" } })}>
          <Mono muted={false}>{formatCount(profile.following_count)} following</Mono>
        </Pressable>
        <Mono>{formatCount(profile.connection_count)} connections</Mono>
        <Mono>{formatCount(profile.reputation)} reputation</Mono>
      </View>
      {!isSelf && <Button label={isFollowing ? "Following" : "Follow"} kind={isFollowing ? "ghost" : "accent"} onPress={() => void toggleFollow()} />}
      <ErrorText>{followError}</ErrorText>

      {/* What they've made comes first: their Drops, then their apps. */}
      <Display size={34} style={{ marginTop: 10 }}>
        Drops <Body muted>{drops.length}</Body>
      </Display>
      {drops.length === 0 && !isSelf ? (
        <Body muted>No Drops yet.</Body>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
          {isSelf && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Post a Drop"
              onPress={() => router.push("/post")}
              style={{ width: 120, aspectRatio: 9 / 16, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", borderColor: t.line, backgroundColor: t.surface, alignItems: "center", justifyContent: "center", gap: 6, padding: 10 }}
            >
              <Display size={40} style={{ color: t.accent }}>
                +
              </Display>
              <Body bold size={13} style={{ textAlign: "center" }}>
                Post a Drop
              </Body>
            </Pressable>
          )}
          {drops.map((drop) => (
            <Pressable
              key={drop.id}
              accessibilityRole="link"
              accessibilityLabel={`${drop.app.name} Drop`}
              onPress={() => router.push(`/apps/${drop.app.slug}`)}
              style={{ width: 120, aspectRatio: 9 / 16, borderRadius: 12, overflow: "hidden", backgroundColor: media.bg }}
            >
              {drop.image_url ? (
                <Image source={{ uri: drop.image_url }} accessibilityIgnoresInvertColors style={{ width: "100%", height: "100%" }} contentFit="cover" />
              ) : (
                <DropPlaceholder name={drop.app.name} />
              )}
              <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 8, backgroundColor: "rgba(0,0,0,0.6)" }}>
                <Body bold size={13} numberOfLines={1} style={{ color: "#fff" }}>
                  {drop.app.name}
                </Body>
                <Mono style={{ color: "rgba(255,255,255,0.75)" }}>
                  ▶ {formatDuration(drop.duration_seconds)} · ♥ {formatCount(drop.like_count)}
                </Mono>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <Display size={34} style={{ marginTop: 10 }}>
        {isSelf ? "Your apps" : "Apps"} <Body muted>{apps.length}</Body>
      </Display>
      {apps.length === 0 && <Body muted>No apps posted yet.</Body>}
      {apps.map((app) => (
        <View key={app.id} style={{ gap: 8 }}>
          <AppBannerCard app={app} width="100%" showOwner={false} />
          {isSelf && SITE_URL && (
            <Button label="✎ Manage: edit, Drops, feedback" kind="ghost" onPress={() => void WebBrowser.openBrowserAsync(`${SITE_URL}/apps/${app.slug}/manage`)} />
          )}
        </View>
      ))}
    </ScrollView>
  );
}
