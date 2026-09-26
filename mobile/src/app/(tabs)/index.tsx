import { useRouter } from "expo-router";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppCard } from "@/components/AppCard";
import { Leaderboard, builderStat, testerStat } from "@/components/Leaderboard";
import { Loading } from "@/components/Loading";
import { Suggestions } from "@/components/Suggestions";
import { Body, Button, Card, Display, ErrorText, Eyebrow, Mono, Wordmark } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { isLive } from "@/lib/config";
import { getHome } from "@/lib/data";
import { useLoad } from "@/lib/useLoad";
import { useTheme } from "@/theme";

// Home: Featured, builders to follow, the newest projects, then this month's
// top builders and top testers. Everything else is on Browse.
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
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16 }}>
        <Wordmark size={22} />
      </View>
      {!isLive && (
        <Mono style={{ textAlign: "center", textTransform: "uppercase", paddingHorizontal: 16 }}>Demo mode · sample apps</Mono>
      )}
      <ErrorText>{error}</ErrorText>
      <View style={{ paddingHorizontal: 16 }}>
        <Eyebrow>What builders shipped</Eyebrow>
        <Display size={52}>Featured</Display>
      </View>
      {featured.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
          {featured.map((app) => (
            <AppCard key={app.id} app={app} wide />
          ))}
        </ScrollView>
      ) : (
        <Body muted style={{ paddingHorizontal: 16 }}>
          Nothing featured yet. Post a Drop and be the first.
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
              <AppCard key={app.id} app={app} wide />
            ))}
          </ScrollView>
        </View>
      )}

      {data && (
        <View style={{ gap: 14, marginTop: 10 }}>
          <Leaderboard
            title="Top builders"
            note="Ranked by tries on their apps and likes on their Drops this month."
            empty="Nobody yet this month. Post a Drop and be the first."
            rows={data.builders.map((b) => ({ ...b, stat: builderStat(b) }))}
          />
          <Leaderboard
            title="Top testers"
            note="Ranked by feedback builders marked helpful, then by feedback given."
            empty="Nobody yet this month. Be the first."
            rows={data.testers.map((x) => ({ ...x, stat: testerStat(x) }))}
          />
        </View>
      )}
    </ScrollView>
  );
}
