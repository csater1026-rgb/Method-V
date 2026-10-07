import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppBannerCard } from "@/components/AppCard";
import { DropBonusPopup } from "@/components/DropBonusPopup";
import { Loading } from "@/components/Loading";
import { Suggestions } from "@/components/Suggestions";
import { Body, Button, Card, Display, ErrorText, Eyebrow, Mono, Wordmark } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { isLive } from "@/lib/config";
import { getHome } from "@/lib/data";
import { useLoad } from "@/lib/useLoad";
import { useTheme } from "@/theme";
import { SpotlightStage } from "@/components/SpotlightStage";
import { LEADERBOARD_PRIZES } from "@shared/constants";
import { STAGE_SPOTS } from "@shared/spotlight-stage";

// Home: the Spotlight, builders to follow, the newest projects, then a link to
// the monthly leaderboards (on Browse). Everything else is on Browse.
export default function HomeScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { viewer } = useAuth();
  const { data, error, refreshing, reload } = useLoad(() => getHome(viewer?.id ?? null), [viewer?.id]);

  if (!data && !error) return <Loading />;

  const featured = data?.featured ?? [];
  const suggestions = data?.suggestions ?? [];
  const newest = data?.newest ?? [];

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={t.muted} />}
    >
      <DropBonusPopup />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16 }}>
        <Wordmark size={22} />
      </View>
      {!isLive && (
        <Mono style={{ textAlign: "center", textTransform: "uppercase", paddingHorizontal: 16 }}>Demo mode · sample apps</Mono>
      )}
      <ErrorText>{error}</ErrorText>
      <View style={{ paddingHorizontal: 16 }}>
        <Eyebrow>What builders shipped</Eyebrow>
        <Display size={52}>{featured[0]?.reason === "hot" ? "Hot right now" : "In the Spotlight"}</Display>
      </View>
      {featured.length > 0 && featured[0].reason !== "hot" ? (
        <>
          <SpotlightStage apps={featured} />
          {/* More paid Spotlights than fit on the stage. */}
          {featured.length > STAGE_SPOTS && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16, paddingTop: 12 }}>
              {featured.slice(STAGE_SPOTS).map((app) => (
                <AppBannerCard key={app.id} app={app} />
              ))}
            </ScrollView>
          )}
        </>
      ) : featured.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
          {featured.map((app) => (
            <AppBannerCard key={app.id} app={app} />
          ))}
        </ScrollView>
      ) : (
        <Body muted style={{ paddingHorizontal: 16 }}>
          Nothing featured yet. Post your project and be the first.
        </Body>
      )}

      <View style={{ marginTop: 10 }}>
        {suggestions.length > 0 ? (
          <Suggestions people={suggestions} />
        ) : (
          !viewer && (
            <Card style={{ marginHorizontal: 16, gap: 8 }}>
              <Display size={32}>Builders like you</Display>
              <Body muted size={13}>
                Sign in and we&apos;ll suggest builders to follow, based on what you build and like.
              </Body>
              <Button label="Sign in" onPress={() => router.push("/sign-in")} style={{ alignSelf: "flex-start" }} />
            </Card>
          )
        )}
      </View>

      {newest.length > 0 && (
        <View style={{ gap: 10, marginTop: 10 }}>
          <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: 16 }}>
            <Display size={36}>Just posted</Display>
            <Pressable accessibilityRole="link" onPress={() => router.push("/browse")} hitSlop={10}>
              <Eyebrow style={{ paddingBottom: 8 }}>See all →</Eyebrow>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
            {newest.map((app) => (
              <AppBannerCard key={app.id} app={app} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* The leaderboards live on Browse; this just points there. */}
      <Pressable accessibilityRole="link" onPress={() => router.push("/browse")} style={{ marginHorizontal: 16, marginTop: 10 }}>
        <Card style={{ gap: 4, borderColor: t.accent }}>
          <Body bold>🏆 Monthly leaderboards</Body>
          <Body muted size={13}>
            Top builders and top testers, on Browse. 1st, 2nd and 3rd win {LEADERBOARD_PRIZES.join(", ")} Methodium when the month ends.
          </Body>
        </Card>
      </Pressable>
    </ScrollView>
  );
}
