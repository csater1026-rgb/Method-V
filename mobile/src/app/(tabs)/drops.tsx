import { useIsFocused, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, RefreshControl, Share, View, type ViewToken } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CATEGORIES, labelFor } from "@shared/constants";
import { formatCount, formatDuration } from "@shared/format";
import type { FeedItem } from "@shared/types";

import { DropPlaceholder } from "@/components/AppCard";
import { Loading } from "@/components/PixelCoder";
import { Sponsored } from "@/components/Sponsored";
import { Avatar, Body, Button, Display, ErrorText, Mono, Tag, tap } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { SITE_URL } from "@/lib/config";
import { getFeed, setLike } from "@/lib/data";
import { learn, loadInterests } from "@/lib/interests";
import { tryApp } from "@/lib/tryApp";
import { useLoad } from "@/lib/useLoad";
import { media, useTheme } from "@/theme";

// The Drops feed, "For you": one full-screen Drop at a time. The one on
// screen plays (muted until you tap), the rest pause. What people watch,
// like, open, try and skip teaches the ranking what they're into.

const WATCHED_MS = 4000;
const SKIPPED_MS = 1500;
export default function DropsScreen() {
  const t = useTheme();
  const { viewer } = useAuth();
  const focused = useIsFocused();
  const { data, error, refreshing, reload } = useLoad(async () => getFeed(viewer?.id ?? null, await loadInterests()), [viewer?.id]);
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems.find((v) => v.isViewable);
    if (first?.index != null) setActive(first.index);
  }).current;

  if (!data && !error) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: media.bg }} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
      {error && <ErrorText>{error}</ErrorText>}
      {height > 0 && (
        <FlatList
          data={data ?? []}
          keyExtractor={(d) => d.id}
          pagingEnabled
          snapToInterval={height}
          decelerationRate="fast"
          showsVerticalScrollIndicator={false}
          getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={t.muted} />}
          renderItem={({ item, index }) => (
            <DropPage
              item={item}
              height={height}
              current={index === active}
              playing={focused && index === active}
              muted={muted}
              onToggleSound={() => setMuted((m) => !m)}
            />
          )}
          ListEmptyComponent={
            <View style={{ height, alignItems: "center", justifyContent: "center", padding: 24 }}>
              <Body style={{ color: media.muted }}>No Drops yet.</Body>
            </View>
          }
        />
      )}
    </View>
  );
}

function DropPage({
  item,
  height,
  current,
  playing,
  muted,
  onToggleSound,
}: {
  item: FeedItem;
  height: number;
  current: boolean;
  playing: boolean;
  muted: boolean;
  onToggleSound: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { viewer } = useAuth();
  const [liked, setLiked] = useState(item.liked);
  const [likes, setLikes] = useState(item.like_count);
  const player = useVideoPlayer(item.video_url ? { uri: item.video_url } : null, (p) => {
    p.loop = true;
    p.muted = true;
  });

  // Once per Drop per visit: watched for a few seconds, or swiped past fast.
  const learned = useRef(false);
  const category = item.app.category;
  useEffect(() => {
    if (!current || learned.current) return;
    const shownAt = Date.now();
    const timer = setTimeout(() => {
      learned.current = true;
      learn(category, "watched");
    }, WATCHED_MS);
    return () => {
      clearTimeout(timer);
      if (!learned.current && Date.now() - shownAt < SKIPPED_MS) {
        learned.current = true;
        learn(category, "skipped");
      }
    };
  }, [current, category]);

  useEffect(() => {
    if (!item.video_url) return;
    player.muted = muted;
    if (playing) player.play();
    else player.pause();
  }, [player, playing, muted, item.video_url]);

  const like = useCallback(async () => {
    if (!viewer) return router.push("/sign-in");
    tap();
    const next = !liked;
    if (next) learn(category, "liked");
    setLiked(next);
    setLikes((n) => n + (next ? 1 : -1));
    const r = await setLike(item.id, next);
    if (!r.ok) {
      setLiked(!next);
      setLikes((n) => n + (next ? -1 : 1));
    }
  }, [viewer, liked, item.id, router, category]);

  const share = () =>
    Share.share({ message: `${item.app.name}: ${item.app.tagline}. Try it on Method V ${SITE_URL ? `${SITE_URL}/apps/${item.app.slug}` : ""}`.trim() });

  return (
    <View style={{ height, backgroundColor: media.bg }}>
      <Pressable accessibilityLabel={muted ? "Turn sound on" : "Turn sound off"} onPress={onToggleSound} style={{ flex: 1 }}>
        {item.video_url ? (
          <VideoView player={player} style={{ flex: 1 }} contentFit="cover" nativeControls={false} />
        ) : (
          <DropPlaceholder name={item.app.name} />
        )}
      </Pressable>

      <View style={{ position: "absolute", top: insets.top + 10, left: 12, flexDirection: "row", gap: 6 }}>
        <Mono style={{ color: media.ink, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
          {formatDuration(item.duration_seconds)}
        </Mono>
        {item.video_url && (
          <Mono style={{ color: media.ink, backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
            {muted ? "Tap for sound" : "Sound on"}
          </Mono>
        )}
      </View>

      <View style={{ position: "absolute", right: 10, bottom: 150, alignItems: "center", gap: 18 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={liked ? "Unlike" : "Like"} accessibilityState={{ selected: liked }} onPress={like} style={{ alignItems: "center", minWidth: 44, minHeight: 44 }}>
          <Body size={30} style={{ color: liked ? media.heart : media.ink }}>
            {liked ? "♥" : "♡"}
          </Body>
          <Mono style={{ color: media.ink }}>{formatCount(likes)}</Mono>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Share" onPress={share} style={{ alignItems: "center", minWidth: 44, minHeight: 44 }}>
          <Body size={26} style={{ color: media.ink }}>
            ↗
          </Body>
          <Mono style={{ color: media.ink }}>Share</Mono>
        </Pressable>
      </View>

      <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: 16, paddingRight: 70, backgroundColor: "rgba(10,14,11,0.72)", gap: 6 }}>
        <Pressable accessibilityRole="link" onPress={() => router.push(`/u/${item.owner.username}`)} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Avatar username={item.owner.username} name={item.owner.display_name} size={26} />
          <Body bold size={13} style={{ color: media.ink }}>
            @{item.owner.username}
          </Body>
        </Pressable>
        <Pressable
          accessibilityRole="link"
          onPress={() => {
            learn(category, "comments");
            router.push(`/apps/${item.app.slug}`);
          }}
        >
          <Display size={40} style={{ color: media.ink }} numberOfLines={1}>
            {item.app.name}
          </Display>
        </Pressable>
        <Body size={13} numberOfLines={2} style={{ color: media.ink, opacity: 0.85 }}>
          {item.caption || item.app.tagline}
        </Body>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 4 }}>
          <Button
            label="Try it →"
            onPress={() => {
              learn(category, "tried");
              void tryApp(item.app.slug);
            }}
          />
          <Tag>{labelFor(CATEGORIES, item.app.category)}</Tag>
          <Mono style={{ color: media.muted }}>{formatCount(item.app.try_count)} tries</Mono>
        </View>
        {item.sponsor && (
          <View style={{ marginTop: 4 }}>
            <Sponsored sponsor={item.sponsor} compact />
          </View>
        )}
      </View>
    </View>
  );
}
