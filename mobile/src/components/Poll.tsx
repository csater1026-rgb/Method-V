import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import type { Poll as PollData } from "@shared/types";

import { useAuth } from "@/lib/auth";
import { votePoll } from "@/lib/data";
import { useTheme } from "@/theme";

import { Body, ErrorText, Mono, tap } from "./ui";

// One-tap poll, same as the website: choices first, then each one's share
// with your pick marked. Tap another to change it, yours again to take it back.
export function Poll({ questionId, poll, dark }: { questionId: string; poll: PollData; dark?: { ink: string; muted: string; line: string } }) {
  const t = useTheme();
  const colors = dark ?? { ink: t.ink, muted: t.muted, line: t.line };
  const router = useRouter();
  const { viewer } = useAuth();
  const [state, setState] = useState({ counts: poll.counts, mine: poll.mine });
  const [error, setError] = useState<string | null>(null);
  const total = state.counts.reduce((a, b) => a + b, 0);
  const results = state.mine !== null;

  async function pick(i: number) {
    if (!viewer) return router.push("/sign-in");
    tap();
    const next = state.mine === i ? null : i;
    const prev = state;
    const counts = [...state.counts];
    if (state.mine !== null) counts[state.mine] = Math.max(0, counts[state.mine] - 1);
    if (next !== null) counts[next] += 1;
    setState({ counts, mine: next });
    setError(null);
    const r = await votePoll(questionId, next);
    if (!r.ok) {
      setState(prev);
      setError(r.error);
    } else setState({ counts: r.data, mine: next });
  }

  return (
    <View style={{ gap: 8 }} accessibilityLabel="Poll">
      {poll.options.map((option, i) => {
        const share = total ? Math.round((state.counts[i] / total) * 100) : 0;
        const mine = state.mine === i;
        return (
          <Pressable
            key={i}
            accessibilityRole="button"
            accessibilityState={{ selected: mine }}
            accessibilityLabel={results ? `${option}, ${share}%` : option}
            onPress={() => void pick(i)}
            style={{ borderWidth: 1, borderColor: mine ? t.accent : colors.line, borderRadius: 10, overflow: "hidden", minHeight: 48, justifyContent: "center" }}
          >
            {results && (
              <View
                style={{
                  position: "absolute",
                  left: 0,
                  top: 0,
                  bottom: 0,
                  width: `${share}%`,
                  backgroundColor: mine ? t.accent : colors.line,
                  opacity: mine ? 0.3 : 0.5,
                }}
              />
            )}
            <View style={{ flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 14, gap: 10 }}>
              <Body bold style={{ color: colors.ink, flexShrink: 1 }}>
                {mine ? "✓ " : ""}
                {option}
              </Body>
              {results && <Mono style={{ color: colors.muted }}>{share}%</Mono>}
            </View>
          </Pressable>
        );
      })}
      <Mono style={{ color: colors.muted }}>
        {total} {total === 1 ? "vote" : "votes"}
        {results ? "" : " · tap to vote and see results"}
      </Mono>
      <ErrorText>{error}</ErrorText>
    </View>
  );
}
