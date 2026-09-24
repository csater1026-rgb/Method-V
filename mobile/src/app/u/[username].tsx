import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, View } from "react-native";

import { ROLES, labelFor, primaryStatus } from "@shared/constants";
import { formatCount } from "@shared/format";
import { socialLinks } from "@shared/socials";

import { AppCard } from "@/components/AppCard";
import { Loading } from "@/components/PixelCoder";
import { Avatar, Body, Button, Display, ErrorText, Mono, StatusBadge, Tag } from "@/components/ui";
import { fileUrl } from "@/lib/config";
import { useAuth } from "@/lib/auth";
import { getProfileBundle, setFollow } from "@/lib/data";
import { useLoad } from "@/lib/useLoad";
import { useTheme } from "@/theme";

export default function ProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const t = useTheme();
  const router = useRouter();
  const { viewer } = useAuth();
  const { data, error, refreshing, reload } = useLoad(
    () => getProfileBundle(String(username).toLowerCase(), viewer?.id ?? null),
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
  const { profile, apps } = data;
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

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={t.muted} />}
    >
      <Stack.Screen options={{ title: `@${profile.username}` }} />
      {/* Photo with the status people message about right next to it. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Avatar username={profile.username} name={profile.display_name} src={fileUrl(profile.avatar_path)} size={84} />
        <View>
          <StatusBadge roles={profile.roles} />
        </View>
      </View>
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Display size={46} style={{ flexShrink: 1 }}>
            {profile.display_name || `@${profile.username}`}
          </Display>
          {pro && <Tag tone="accent">Pro</Tag>}
        </View>
        <Body muted>@{profile.username}</Body>
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
        <Mono>{formatCount(profile.follower_count)} followers</Mono>
        <Mono>{formatCount(profile.connection_count)} connections</Mono>
        <Mono>{formatCount(profile.reputation)} reputation</Mono>
      </View>
      {!isSelf && <Button label={isFollowing ? "Following" : "Follow"} kind={isFollowing ? "ghost" : "accent"} onPress={() => void toggleFollow()} />}
      <ErrorText>{followError}</ErrorText>

      <Display size={34} style={{ marginTop: 10 }}>
        Apps
      </Display>
      {apps.length === 0 && <Body muted>No apps posted yet.</Body>}
      {apps.map((app) => (
        <AppCard key={app.id} app={app} />
      ))}
    </ScrollView>
  );
}
