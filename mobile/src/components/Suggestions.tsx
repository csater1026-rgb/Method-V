import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { CATEGORIES, ROLES, labelFor, primaryStatus } from "@shared/constants";
import type { Suggestion } from "@shared/types";

import { useAuth } from "@/lib/auth";
import { setFollow } from "@/lib/data";

import { useTheme } from "@/theme";

import { Avatar, Body, Display, ErrorText, Handle } from "./ui";

// "Builders like you": people who build in the categories you build, like and
// test, or share your skills. Same as the website's Home.
// A 2 by 2 grid of square tiles (the first 4), like the website on phones.
export function Suggestions({ people }: { people: Suggestion[] }) {
  if (people.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Display size={36} style={{ paddingHorizontal: 16 }}>
        Builders like you
      </Display>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 12,
          paddingHorizontal: 16,
        }}
      >
        {people.slice(0, 4).map((p) => (
          <SuggestionCard key={p.id} person={p} />
        ))}
      </View>
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

  // A square tile, like the website: photo, name, @handle and status, what
  // you have in common, and a Follow button across the bottom.
  return (
    <View
      style={{
        flexBasis: "47%",
        flexGrow: 1,
        aspectRatio: 1,
        minHeight: 196,
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
        borderWidth: 1,
        borderColor: t.line,
        backgroundColor: t.surface,
        borderRadius: 16,
        padding: 12,
      }}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${p.display_name || p.username}'s profile`}
        onPress={() => router.push(`/u/${p.username}`)}
        style={{ alignItems: "center", gap: 3, width: "100%" }}
      >
        <View
          style={{
            borderRadius: 999,
            borderWidth: 2,
            borderColor: t.line,
            marginBottom: 4,
          }}
        >
          <Avatar
            username={p.username}
            name={p.display_name}
            src={p.avatar_url}
            size={52}
          />
        </View>
        <Body bold numberOfLines={1} style={{ textAlign: "center" }}>
          {p.display_name || <Handle username={p.username} />}
        </Body>
        <Body muted size={12} numberOfLines={1} style={{ textAlign: "center" }}>
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
        <Body muted size={11} numberOfLines={1} style={{ textAlign: "center" }}>
          {shared.length > 0
            ? shared.slice(0, 2).join(" · ")
            : "New on Method V"}
        </Body>
        <ErrorText>{error}</ErrorText>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${following ? "Unfollow" : "Follow"} @${p.username}`}
        onPress={() => void toggle()}
        style={{
          alignSelf: "stretch",
          alignItems: "center",
          marginTop: 6,
          borderRadius: 999,
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
