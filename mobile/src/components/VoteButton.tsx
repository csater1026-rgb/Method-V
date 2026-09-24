import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable } from "react-native";

import { useAuth } from "@/lib/auth";
import { setQaVote } from "@/lib/data";
import { useTheme } from "@/theme";

import { Body, Mono, tap } from "./ui";

// Upvote a question or an answer, like on the website. Updates right away
// and rolls back if it doesn't save. Your own posts can't be voted on.
export function VoteButton({
  kind,
  id,
  count,
  voted,
  authorId,
  colors,
  onError,
}: {
  kind: "question" | "answer";
  id: string;
  count: number;
  voted: boolean;
  authorId: string;
  colors?: { ink: string; muted: string; line: string };
  onError?: (message: string) => void;
}) {
  const t = useTheme();
  const c = colors ?? { ink: t.ink, muted: t.muted, line: t.line };
  const router = useRouter();
  const { viewer } = useAuth();
  const [state, setState] = useState({ voted, count });
  const own = viewer?.id === authorId;

  async function toggle() {
    if (!viewer) return router.push("/sign-in");
    if (own) return onError?.("You can't vote on your own post.");
    tap();
    const next = !state.voted;
    const prev = state;
    setState({ voted: next, count: Math.max(0, state.count + (next ? 1 : -1)) });
    const r = await setQaVote(kind, id, next);
    if (!r.ok) {
      setState(prev);
      onError?.(r.error);
    }
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={state.voted ? `Remove upvote, ${state.count}` : `Upvote, ${state.count}`}
      accessibilityState={{ selected: state.voted, disabled: own }}
      onPress={() => void toggle()}
      hitSlop={6}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderWidth: 1,
        borderColor: state.voted ? t.accent : c.line,
        backgroundColor: state.voted ? t.accent : "transparent",
        borderRadius: 8,
        paddingHorizontal: 10,
        minHeight: 34,
        opacity: own ? 0.5 : 1,
      }}
    >
      <Body bold size={13} style={{ color: state.voted ? t.accentInk : c.ink }}>
        ▲
      </Body>
      <Mono muted={false} style={{ color: state.voted ? t.accentInk : c.ink }}>
        {state.count}
      </Mono>
    </Pressable>
  );
}
