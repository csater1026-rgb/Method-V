import { useRouter } from "expo-router";
import { FlatList, Pressable, RefreshControl, View } from "react-native";

import { CATEGORIES, labelFor } from "@shared/constants";
import { formatCount } from "@shared/format";
import type { QuestionCard } from "@shared/types";

import { learn } from "@/lib/interests";
import { media } from "@/theme";

import { Poll } from "./Poll";
import { VoteButton } from "./VoteButton";
import { Avatar, Body, Button, Display, Mono, Tag } from "./ui";

const DARK = { ink: media.ink, muted: media.muted, line: media.line };

// The Questions side of Drops: one question per screen, swipe for the next.
// Polls answer with one tap; everything else opens the thread.
export function QuestionPager({
  items,
  height,
  topInset,
  refreshing,
  onRefresh,
}: {
  items: QuestionCard[];
  height: number;
  topInset: number;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const router = useRouter();
  return (
    <FlatList
      data={items}
      keyExtractor={(q) => q.id}
      pagingEnabled
      snapToInterval={height}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={media.muted} />}
      renderItem={({ item }) => <QuestionPage q={item} height={height} topInset={topInset} />}
      ListFooterComponent={
        <View style={{ height, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 }}>
          <Display size={40} style={{ color: media.ink, textAlign: "center" }}>
            Got a question?
          </Display>
          <Body style={{ color: media.muted, textAlign: "center" }}>Ask people about your app, with a poll if you like. It shows up here for everyone.</Body>
          <Button label="Ask a question" onPress={() => router.push("/ask")} />
        </View>
      }
    />
  );
}

function QuestionPage({ q, height, topInset }: { q: QuestionCard; height: number; topInset: number }) {
  const router = useRouter();
  const open = () => {
    learn(q.app.category, "comments");
    router.push(`/q/${q.id}`);
  };
  const topAnswer = q.answers.find((a) => a.id === q.best_answer_id) ?? q.answers.find((a) => !a.parent_id);

  return (
    <View style={{ height, backgroundColor: media.bg, paddingTop: topInset + 56, paddingHorizontal: 18, paddingBottom: 20, gap: 14 }}>
      <Pressable accessibilityRole="link" onPress={() => router.push(`/apps/${q.app.slug}`)} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Display size={28} style={{ color: media.ink }} numberOfLines={1}>
            {q.app.name}
          </Display>
          <Body size={12} numberOfLines={1} style={{ color: media.muted }}>
            {q.app.tagline}
          </Body>
        </View>
        {q.by_builder ? <Tag tone="accent">Builder asks</Tag> : <Tag>{labelFor(CATEGORIES, q.app.category)}</Tag>}
      </Pressable>

      <Pressable accessibilityRole="link" onPress={open}>
        <Body bold size={26} style={{ color: media.ink, lineHeight: 32 }}>
          {q.body}
        </Body>
      </Pressable>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Avatar username={q.user.username} name={q.user.display_name} src={q.user.avatar_url} size={20} />
        <Body size={13} style={{ color: media.muted }}>
          @{q.user.username}
        </Body>
      </View>

      {q.poll && <Poll questionId={q.id} poll={q.poll} dark={DARK} />}

      {topAnswer && (
        <Pressable onPress={open} style={{ borderWidth: 1, borderColor: media.line, borderRadius: 10, padding: 12, gap: 4, backgroundColor: media.surface }}>
          <Mono style={{ color: media.muted }}>
            @{topAnswer.user.username}
            {topAnswer.id === q.best_answer_id ? " · ✓ best" : ""}
          </Mono>
          <Body size={14} numberOfLines={3} style={{ color: media.ink }}>
            {topAnswer.body}
          </Body>
        </Pressable>
      )}

      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <VoteButton kind="question" id={q.id} count={q.vote_count} voted={q.voted} authorId={q.user.id} colors={DARK} />
          <Mono style={{ color: media.muted }}>
            {formatCount(q.answer_count)} {q.answer_count === 1 ? "answer" : "answers"}
          </Mono>
        </View>
        <Button label={q.answer_count === 0 ? "Be the first →" : "Answer →"} onPress={open} />
      </View>
    </View>
  );
}
