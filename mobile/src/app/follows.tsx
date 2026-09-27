import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, View } from "react-native";

import { formatCount } from "@shared/format";

import { Loading } from "@/components/Loading";
import { Avatar, Body, ErrorText, Handle, Mono, StatusBadge } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { getFollowList, setFollow } from "@/lib/data";
import { useLoad } from "@/lib/useLoad";
import { useTheme } from "@/theme";

// Someone's followers, or who they follow, from the counts on their profile.
// Same as the website's /u/<name>/followers and /following.
export default function FollowsScreen() {
  const t = useTheme();
  const router = useRouter();
  const { viewer } = useAuth();
  const params = useLocalSearchParams<{ username: string; kind?: string }>();
  const username = String(params.username ?? "");
  const kind = params.kind === "following" ? "following" : "followers";
  const { data, error, refreshing, reload } = useLoad(() => getFollowList(username, kind, viewer?.id ?? null), [username, kind, viewer?.id]);
  // Follow taps made on this screen, on top of what was loaded.
  const [changed, setChanged] = useState<Record<string, boolean>>({});
  const [followError, setFollowError] = useState<string | null>(null);

  if (!data) return error ? <ErrorText>{error}</ErrorText> : <Loading />;
  const name = data.owner.display_name || `@${data.owner.username}`;

  async function toggle(id: string, now: boolean) {
    if (!viewer) return router.push("/sign-in");
    setFollowError(null);
    setChanged((c) => ({ ...c, [id]: !now }));
    const r = await setFollow(id, !now);
    if (!r.ok) {
      setChanged((c) => ({ ...c, [id]: now }));
      setFollowError(r.error);
    }
  }

  const tab = (k: "followers" | "following", label: string) => {
    const on = k === kind;
    return (
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: on }}
        onPress={() => router.setParams({ kind: k })}
        style={{ flex: 1, minHeight: 40, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: on ? t.accent : "transparent" }}
      >
        <Body bold size={14} style={{ color: on ? t.accentInk : t.muted }}>
          {label}
        </Body>
      </Pressable>
    );
  };

  return (
    <FlatList
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={t.muted} />}
      data={data.people}
      keyExtractor={(p) => p.id}
      ListHeaderComponent={
        <View style={{ gap: 12, marginBottom: 4 }}>
          <Stack.Screen options={{ title: kind === "followers" ? `${name}'s followers` : `${name} follows` }} />
          <View accessibilityRole="tablist" style={{ flexDirection: "row", borderWidth: 1, borderColor: t.line, borderRadius: 10, padding: 3 }}>
            {tab("followers", "Followers")}
            {tab("following", "Following")}
          </View>
          <ErrorText>{followError}</ErrorText>
        </View>
      }
      ListEmptyComponent={
        <Body muted style={{ textAlign: "center", marginTop: 24 }}>
          {kind === "followers" ? "No followers yet." : "Not following anyone yet."}
        </Body>
      }
      ListFooterComponent={
        data.total > data.people.length ? (
          <Mono style={{ textAlign: "center", marginTop: 8 }}>
            Showing the newest {formatCount(data.people.length)} of {formatCount(data.total)}
          </Mono>
        ) : null
      }
      renderItem={({ item: p }) => {
        const follows = changed[p.id] ?? data.youFollow.has(p.id);
        return (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 }}>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel={`${p.display_name || p.username}, @${p.username}`}
              onPress={() => router.push(`/u/${p.username}`)}
              style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
            >
              <Avatar username={p.username} name={p.display_name} src={p.avatar_url ?? null} size={44} />
              <View style={{ flex: 1 }}>
                <Body bold numberOfLines={1}>
                  {p.display_name || <Handle username={p.username} />}
                </Body>
                <Body muted size={13} numberOfLines={1}>
                  <Handle username={p.username} size={13} />
                </Body>
                <StatusBadge roles={p.roles} />
              </View>
            </Pressable>
            {viewer?.id !== p.id && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={follows ? `Unfollow @${p.username}` : `Follow @${p.username}`}
                onPress={() => void toggle(p.id, follows)}
                style={{
                  minHeight: 36,
                  paddingHorizontal: 14,
                  borderRadius: 8,
                  justifyContent: "center",
                  borderWidth: 1,
                  borderColor: follows ? t.line : t.accent,
                  backgroundColor: follows ? "transparent" : t.accent,
                }}
              >
                <Body bold size={13} style={{ color: follows ? t.ink : t.accentInk }}>
                  {follows ? "Following" : "Follow"}
                </Body>
              </Pressable>
            )}
          </View>
        );
      }}
    />
  );
}
