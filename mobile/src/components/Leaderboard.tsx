import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";

import { formatCount } from "@shared/format";

import { useTheme } from "@/theme";

import { Avatar, Body, Card, Display, Handle, Mono } from "./ui";

type Row = { user_id: string; username: string; display_name: string; avatar_url?: string | null; stat: string };

// A monthly leaderboard card on Home (top builders, top testers), like the
// website's.
export function Leaderboard({ title, note, empty, rows }: { title: string; note: string; empty: string; rows: Row[] }) {
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
      {rows.length === 0 ? (
        <Body muted size={13} style={{ marginTop: 4 }}>
          {empty}
        </Body>
      ) : (
        rows.map((r, i) => (
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
          </Pressable>
        ))
      )}
    </Card>
  );
}

export const builderStat = (b: { tries: number }) => `${formatCount(b.tries)} tries`;
export const testerStat = (t: { helpful_count: number }) => `${t.helpful_count} helpful`;
