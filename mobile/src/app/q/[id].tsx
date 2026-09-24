import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";

import { timeAgo } from "@shared/format";
import type { Answer } from "@shared/types";

import { Loading } from "@/components/PixelCoder";
import { Poll } from "@/components/Poll";
import { Avatar, Body, Button, Card, Display, ErrorText, Mono, Tag } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { answerQuestion, getQuestion } from "@/lib/data";
import { useLoad } from "@/lib/useLoad";
import { fonts, useTheme } from "@/theme";

// A question's whole thread: the question (and its poll), answers with the
// best one on top, and replies under the answer they reply to.
export default function QuestionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTheme();
  const router = useRouter();
  const { viewer } = useAuth();
  const { data: q, error, refreshing, reload } = useLoad(() => getQuestion(String(id), viewer?.id ?? null), [id, viewer?.id]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  if (q === null && !error) return <Loading />;
  if (!q) {
    return (
      <View style={{ flex: 1, padding: 24, backgroundColor: t.bg }}>
        <Display size={36}>Question not found</Display>
        <ErrorText>{error}</ErrorText>
      </View>
    );
  }

  async function send() {
    if (!viewer) return router.push("/sign-in");
    setBusy(true);
    setSendError(null);
    const r = await answerQuestion(q!.id, body, replyTo ? (replyTo.parent_id ?? replyTo.id) : null);
    setBusy(false);
    if (!r.ok) return setSendError(r.error);
    setBody("");
    setReplyTo(null);
    await reload();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: q.app.name }} />
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 24 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={t.muted} />}
      >
        <Pressable accessibilityRole="link" onPress={() => router.push(`/apps/${q.app.slug}`)}>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Display size={26} numberOfLines={1}>
                {q.app.name}
              </Display>
              <Body muted size={12} numberOfLines={1}>
                {q.app.tagline}
              </Body>
            </View>
            {q.by_builder && <Tag tone="accent">Builder asks</Tag>}
          </Card>
        </Pressable>

        <Body bold size={24} style={{ lineHeight: 30 }}>
          {q.body}
        </Body>
        <Byline user={q.user} at={q.created_at} />
        {q.poll && <Poll questionId={q.id} poll={q.poll} />}

        <Mono style={{ marginTop: 6 }}>
          {q.answer_count} {q.answer_count === 1 ? "answer" : "answers"}
        </Mono>
        {q.answers.length === 0 && <Body muted>No answers yet. Be the first.</Body>}
        {q.answers.map((a) => {
          const best = a.id === q.best_answer_id;
          return (
            <View
              key={a.id}
              style={{
                marginLeft: a.parent_id ? 22 : 0,
                paddingLeft: a.parent_id ? 12 : 0,
                borderLeftWidth: a.parent_id ? 2 : 0,
                borderLeftColor: t.line,
                gap: 4,
              }}
            >
              <Card style={{ gap: 6, borderColor: best ? t.accent : t.line }}>
                {(best || a.user.id === q.app.owner_id) && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                    {best && <Tag tone="accent">✓ Best answer</Tag>}
                    {a.user.id === q.app.owner_id && <Tag>Builder</Tag>}
                  </View>
                )}
                <Body>{a.body}</Body>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Byline user={a.user} at={a.created_at} />
                  <Mono>▲ {a.vote_count}</Mono>
                </View>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => (viewer ? setReplyTo(a) : router.push("/sign-in"))}
                  hitSlop={8}
                  style={{ alignSelf: "flex-start" }}
                >
                  <Body bold size={13} style={{ color: t.accent }}>
                    Reply
                  </Body>
                </Pressable>
              </Card>
            </View>
          );
        })}
      </ScrollView>

      <View style={{ borderTopWidth: 1, borderTopColor: t.line, padding: 12, gap: 8, backgroundColor: t.bg }}>
        {replyTo && (
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Mono>Replying to @{replyTo.user.username}</Mono>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
              <Mono>Cancel</Mono>
            </Pressable>
          </View>
        )}
        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder={viewer ? (replyTo ? "Your reply" : "Your answer") : "Sign in to answer"}
            placeholderTextColor={t.muted}
            editable={Boolean(viewer)}
            multiline
            maxLength={1000}
            accessibilityLabel={replyTo ? "Your reply" : "Your answer"}
            style={{ flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: t.line, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: t.ink, fontFamily: fonts.body, fontSize: 16 }}
          />
          {viewer ? (
            <Button label={replyTo ? "Reply" : "Answer"} busy={busy} disabled={!body.trim()} onPress={() => void send()} />
          ) : (
            <Button label="Sign in" onPress={() => router.push("/sign-in")} />
          )}
        </View>
        <ErrorText>{sendError}</ErrorText>
      </View>
    </KeyboardAvoidingView>
  );
}

function Byline({ user, at }: { user: Answer["user"]; at: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Avatar username={user.username} name={user.display_name} src={user.avatar_url} size={18} />
      <Body muted size={12}>
        @{user.username} · {timeAgo(at)}
      </Body>
    </View>
  );
}
