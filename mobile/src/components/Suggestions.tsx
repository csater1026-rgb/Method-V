import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { CATEGORIES, ROLES, labelFor, primaryStatus } from "@shared/constants";
import type { Suggestion } from "@shared/types";

import { useAuth } from "@/lib/auth";
import { setFollow } from "@/lib/data";

import { useTheme } from "@/theme";

import { Avatar, Body, Display, ErrorText, Handle } from "./ui";

// "Builders like you": people who build in the categories you build, like and
// test, or share your skills. Same as the website's Home.
export function Suggestions({ people }: { people: Suggestion[] }) {
  if (people.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Display size={36} style={{ paddingHorizontal: 16 }}>
        Builders like you
      </Display>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}
      >
        {people.map((p) => (
          <SuggestionCard key={p.id} person={p} />
        ))}
      </ScrollView>
    </View>
  );
}

function SuggestionCard({ person: p }: { person: Suggestion }) {
  const t = useTheme();
  const router = useRouter();
  const { viewer } = useAuth();
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shared = [
    ...p.shared_categories.map((c) => labelFor(CATEGORIES, c)),
    ...p.shared_skills,
  ];

  async function toggle() {
    if (!viewer) return router.push("/sign-in");
    const next = !following;
    setFollowing(next);
    setError(null);
    const r = await setFollow(p.id, next);
    if (!r.ok) {
      setFollowing(!next);
      setError(r.error);
    }
  }

  // Their status (hiring, looking for work…), or else their first role.
  const status = primaryStatus(p.roles);
  const role = status ?? p.roles[0];

  // A compact row, like the website: photo, name, @handle and status, what
  // you have in common, and a pill Follow button on the right.
  return (
    <View
      style={{
        width: 320,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderColor: t.line,
        backgroundColor: t.surface,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 12,
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${p.display_name || p.username}'s profile`}
        onPress={() => router.push(`/u/${p.username}`)}
        style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}
      >
        <View
          style={{ borderRadius: 999, borderWidth: 2, borderColor: t.line }}
        >
          <Avatar
            username={p.username}
            name={p.display_name}
            src={p.avatar_url}
            size={46}
          />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Body bold numberOfLines={1}>
            {p.display_name || <Handle username={p.username} />}
          </Body>
          <Body muted size={12} numberOfLines={1}>
            <Handle username={p.username} size={12} />
            {role ? (
              <>
                {" · "}
                <Body
                  size={12}
                  bold={Boolean(status)}
                  style={{ color: status ? t.accent : t.muted }}
                >
                  {labelFor(ROLES, role)}
                </Body>
              </>
            ) : null}
          </Body>
          <Body muted size={12} numberOfLines={1} style={{ marginTop: 2 }}>
            {shared.length > 0
              ? `In common: ${shared.slice(0, 3).join(" · ")}`
              : "New on Method V"}
          </Body>
          <ErrorText>{error}</ErrorText>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${following ? "Unfollow" : "Follow"} @${p.username}`}
        onPress={() => void toggle()}
        style={{
          borderRadius: 999,
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: following ? "transparent" : t.accent,
          borderWidth: 1,
          borderColor: following ? t.line : t.accent,
        }}
      >
        <Body bold size={14} style={{ color: following ? t.ink : t.accentInk }}>
          {following ? "Following" : "Follow"}
        </Body>
      </Pressable>
    </View>
  );
}
