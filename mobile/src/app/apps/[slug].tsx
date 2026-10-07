import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import * as WebBrowser from "expo-web-browser";
import { Pressable, RefreshControl, ScrollView, Share, View } from "react-native";

import { CATEGORIES, PRICING, STAGES, labelFor } from "@shared/constants";
import { formatCount, timeAgo } from "@shared/format";

import { AppLogo, DropPlaceholder } from "@/components/AppCard";
import { Loading } from "@/components/Loading";
import { Sponsored } from "@/components/Sponsored";
import { TryCount } from "@/components/TryCount";
import { Avatar, Body, Button, Card, Display, ErrorText, Handle, Mono, StatusBadge, Tag, tap } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { SITE_URL, fileUrl } from "@/lib/config";
import { getAppDetail, getAppQuestions, setLike } from "@/lib/data";
import { tryApp } from "@/lib/tryApp";
import { useLoad } from "@/lib/useLoad";
import { useIsWide } from "@/lib/videoShape";
import { fonts, media, useTheme } from "@/theme";

export default function AppScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTheme();
  const router = useRouter();
  const { viewer } = useAuth();
  const { data, error, refreshing, reload, setData } = useLoad(async () => {
    const found = await getAppDetail(slug, viewer?.id ?? null);
    // Throwing (not returning null) shows "not found" instead of a spinner.
    if (!found) throw new Error("It may have been taken down.");
    return found;
  }, [slug, viewer?.id]);
  const questions = useLoad(
    async () => (data?.app ? getAppQuestions(data.app.id, viewer?.id ?? null) : null),
    [data?.app?.id, viewer?.id],
  );
  // A horizontal (16:9) Drop gets a 16:9 player.
  const wide = useIsWide(data?.app.drop?.poster_url);

  if (data === null && !error) return <Loading />;
  if (!data) {
    return (
      <View style={{ flex: 1, padding: 24, backgroundColor: t.bg }}>
        <Display size={36}>App not found</Display>
        <ErrorText>{error}</ErrorText>
      </View>
    );
  }
  const { app } = data;
  const wouldUse = app.feedback_count ? Math.round((app.would_use_yes_count / app.feedback_count) * 100) : null;
  const rating = app.feedback_count ? (app.rating_sum / app.feedback_count).toFixed(1) : null;

  async function like() {
    if (!app.drop) return;
    if (!viewer) return router.push("/sign-in");
    tap();
    const next = !app.liked;
    const r = await setLike(app.drop.id, next);
    if (r.ok) setData({ ...data!, app: { ...app, liked: next, drop: { ...app.drop, like_count: app.drop.like_count + (next ? 1 : -1) } } });
  }

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={t.muted} />}
      keyboardShouldPersistTaps="handled"
    >
      <Stack.Screen options={{ title: app.name }} />
      <View style={{ aspectRatio: wide ? 16 / 9 : 9 / 16, maxHeight: 520, borderRadius: 12, overflow: "hidden", backgroundColor: media.bg, alignSelf: "center", width: "100%" }}>
        {app.drop?.video_url ? <Player uri={app.drop.video_url} /> : <DropPlaceholder name={app.name} />}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
        <Tag>{labelFor(CATEGORIES, app.category)}</Tag>
        <Tag>{labelFor(PRICING, app.pricing)}</Tag>
        <Tag>{labelFor(STAGES, app.stage)}</Tag>
      </View>
      <View>
        <View style={{ marginBottom: 8 }}>
          <AppLogo name={app.name} src={fileUrl(app.logo_path ?? null)} size={56} />
        </View>
        <Display size={56}>{app.name}</Display>
        <Body muted size={17}>
          {app.tagline}
        </Body>
        <Body muted size={12} style={{ marginTop: 4 }}>
          Posted {timeAgo(app.created_at)}
        </Body>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        <Button label="Try it →" onPress={() => void tryApp(app.slug)} style={{ paddingHorizontal: 26 }} />
        {app.drop && (
          <Button
            label={`${app.liked ? "♥" : "♡"} ${formatCount(app.drop.like_count)}`}
            accessibilityLabel={app.liked ? "Unlike" : "Like"}
            kind="ghost"
            onPress={() => void like()}
          />
        )}
        <Button
          label="Share"
          kind="ghost"
          onPress={() => void Share.share({ message: `${app.name}: ${app.tagline}. Try it on Method V ${SITE_URL ? `${SITE_URL}/apps/${app.slug}` : ""}`.trim() })}
        />
        {/* Your own app: edit it, add Drops, reply to feedback (on the website for now). */}
        {viewer?.id === app.owner_id && SITE_URL ? (
          <Button label="✎ Manage" kind="ghost" onPress={() => void WebBrowser.openBrowserAsync(`${SITE_URL}/apps/${app.slug}/manage`)} />
        ) : null}
      </View>

      {app.sponsor && <Sponsored sponsor={app.sponsor} />}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Stat label="Tries" value={<TryCount appId={app.id} count={app.try_count} />} />
        <Stat label="Likes" value={formatCount(app.like_count)} />
        <Stat label="Would use" value={wouldUse === null ? "—" : `${wouldUse}%`} />
        <Stat label="Rating" value={rating === null ? "—" : `${rating}★`} />
      </View>

      {app.description ? <Body>{app.description}</Body> : null}
      {app.tech_stack.length > 0 && (
        <View style={{ gap: 6 }}>
          <Body bold muted size={13}>
            Built with
          </Body>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {app.tech_stack.map((s) => (
              <Tag key={s}>{s}</Tag>
            ))}
          </View>
        </View>
      )}

      <Pressable accessibilityRole="link" onPress={() => router.push(`/u/${app.owner.username}`)}>
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Avatar username={app.owner.username} name={app.owner.display_name} src={app.owner.avatar_url} size={44} />
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 }}>
              <Body bold>{app.owner.display_name || <Handle username={app.owner.username} />}</Body>
              <StatusBadge roles={app.owner.roles} />
            </View>
            <Body muted size={13}>
              <Handle username={app.owner.username} size={13} />
            </Body>
          </View>
          <Mono>Profile →</Mono>
        </Card>
      </Pressable>

      <View style={{ gap: 10 }}>
        <Display size={32}>
          Q&amp;A <Mono>{questions.data?.length ?? 0}</Mono>
        </Display>
        {(questions.data ?? []).length === 0 && <Body muted>No questions yet. Curious how it works, or what&apos;s next? Ask.</Body>}
        {(questions.data ?? []).slice(0, 5).map((q) => (
          <Pressable key={q.id} accessibilityRole="link" onPress={() => router.push(`/q/${q.id}`)}>
            <Card style={{ gap: 4 }}>
              <Body bold>{q.body}</Body>
              <Mono>
                {q.answer_count} {q.answer_count === 1 ? "answer" : "answers"}
                {q.poll ? " · poll" : ""} · ▲ {q.vote_count}
              </Mono>
            </Card>
          </Pressable>
        ))}
        <Button
          label="Ask a question"
          kind="ghost"
          onPress={() => router.push({ pathname: "/ask", params: { app: app.id, name: app.name } })}
        />
      </View>

    </ScrollView>
  );
}

function Player({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
  });
  return <VideoView player={player} style={{ flex: 1 }} contentFit="contain" nativeControls />;
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: t.surface, borderColor: t.line, borderWidth: 1, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}>
      <Mono size={9} style={{ textTransform: "uppercase" }}>
        {label}
      </Mono>
      <Mono muted={false} size={16} style={{ fontFamily: fonts.monoBold, marginTop: 4 }}>
        {value}
      </Mono>
    </View>
  );
}
