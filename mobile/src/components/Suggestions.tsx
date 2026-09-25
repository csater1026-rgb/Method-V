import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";

import { CATEGORIES, ROLES, labelFor } from "@shared/constants";
import type { Suggestion } from "@shared/types";

import { useAuth } from "@/lib/auth";
import { setFollow } from "@/lib/data";

import { Avatar, Body, Button, Card, Display, ErrorText, Tag } from "./ui";

// "Builders like you": people who build in the categories you build, like and
// test, or share your skills. Same as the website's Home.
export function Suggestions({ people }: { people: Suggestion[] }) {
  if (people.length === 0) return null;
  return (
    <View style={{ gap: 10 }}>
      <Display size={36} style={{ paddingHorizontal: 16 }}>
        Builders like you
      </Display>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
        {people.map((p) => (
          <SuggestionCard key={p.id} person={p} />
        ))}
      </ScrollView>
    </View>
  );
}

function SuggestionCard({ person: p }: { person: Suggestion }) {
  const router = useRouter();
  const { viewer } = useAuth();
  const [following, setFollowing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const shared = [...p.shared_categories.map((c) => labelFor(CATEGORIES, c)), ...p.shared_skills];

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

  return (
    <Card style={{ width: 240, gap: 8 }}>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`${p.display_name || p.username}'s profile`}
        onPress={() => router.push(`/u/${p.username}`)}
        style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
      >
        <Avatar username={p.username} name={p.display_name} src={p.avatar_url} size={44} />
        <View style={{ flex: 1 }}>
          <Body bold numberOfLines={1}>
            {p.display_name || `@${p.username}`}
          </Body>
          <Body muted size={12} numberOfLines={1}>
            @{p.username}
          </Body>
        </View>
      </Pressable>
      {p.roles.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {p.roles.map((r) => (
            <Tag key={r} tone={r === "hiring" || r === "looking_for_work" ? "accent" : "plain"}>
              {labelFor(ROLES, r)}
            </Tag>
          ))}
        </View>
      )}
      <Body muted size={12}>
        {shared.length > 0 ? `In common: ${shared.slice(0, 3).join(" · ")}` : "New on Method V"}
      </Body>
      <View style={{ flex: 1 }} />
      <Button
        label={following ? "Following" : "Follow"}
        kind={following ? "ghost" : "accent"}
        accessibilityLabel={`${following ? "Unfollow" : "Follow"} @${p.username}`}
        onPress={() => void toggle()}
      />
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}
