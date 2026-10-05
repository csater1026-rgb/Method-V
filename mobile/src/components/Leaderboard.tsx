import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { LEADERBOARD_PRIZES } from "@shared/constants";
import { formatCount } from "@shared/format";

import { useTheme } from "@/theme";

import { Avatar, Body, Card, Display, Handle, Mono } from "./ui";

type Row = { user_id: string; username: string; display_name: string; avatar_url?: string | null; stat: string };

// A monthly leaderboard card on Browse (top builders, top testers), like the
// website's. The top 3 win V Coin when the month ends (LEADERBOARD_PRIZES).
export function Leaderboard({ title, note, empty, rows, limit = 5 }: { title: string; note: string; empty: string; rows: Row[]; limit?: number }) {
  const t = useTheme();
  const router = useRouter();
  const month = new Date().toLocaleDateString("en-US", { month: "long" });
  return (
    <Card style={{ marginHorizontal: 16, gap: 6 }}>
      <Display size={30}>
        {title} · {month}
      </Display>
      <Body muted size={13}>
        {note}
      </Body>
      <View style={{ alignSelf: "flex-start", borderWidth: 1, borderColor: t.accent, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
        <Body size={12} bold>
          🏆 At the end of the month: 1st wins {LEADERBOARD_PRIZES[0]} V Coin · 2nd {LEADERBOARD_PRIZES[1]} · 3rd {LEADERBOARD_PRIZES[2]}
        </Body>
      </View>
      {rows.length === 0 ? (
        <Body muted size={13} style={{ marginTop: 4 }}>
          {empty}
        </Body>
      ) : (
        rows.slice(0, limit).map((r, i) => (
          <Pressable
            key={r.user_id}
            accessibilityRole="link"
            accessibilityLabel={`${i + 1}. ${r.display_name || r.username}, ${r.stat}`}
            onPress={() => router.push(`/u/${r.username}`)}
            style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.line }}
          >
            <Mono muted={i >= 3} style={{ width: 20, color: i < 3 ? t.accent : t.muted, fontSize: 13 }}>
              {i + 1}
            </Mono>
            <Avatar username={r.username} name={r.display_name} src={r.avatar_url} size={28} />
            <Body bold numberOfLines={1} style={{ flex: 1 }}>
              {r.display_name || <Handle username={r.username} />}
            </Body>
            <Mono>{r.stat}</Mono>
            {i < 3 && (
              <Mono style={{ color: t.accent, fontSize: 12 }} accessibilityLabel={`wins ${LEADERBOARD_PRIZES[i]} V Coin`}>
                +{LEADERBOARD_PRIZES[i]}
              </Mono>
            )}
          </Pressable>
        ))
      )}
    </Card>
  );
}

export const builderStat = (b: { tries: number }) => `${formatCount(b.tries)} tries`;
export const testerStat = (t: { helpful_count: number }) => `${t.helpful_count} helpful`;
