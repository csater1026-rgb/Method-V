import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppCard } from "@/components/AppCard";
import { Loading } from "@/components/PixelCoder";
import { Suggestions } from "@/components/Suggestions";
import { Body, Button, Card, Display, ErrorText, Mono, Wordmark } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { isLive } from "@/lib/config";
import { getHome } from "@/lib/data";
import { useLoad } from "@/lib/useLoad";
import { useTheme } from "@/theme";

// Home: just Featured and builders to follow. Everything else is on Browse.
export default function HomeScreen() {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { viewer } = useAuth();
  const { data, error, refreshing, reload } = useLoad(() => getHome(viewer?.id ?? null), [viewer?.id]);

  if (!data && !error) return <Loading />;

  const featured = data?.featured ?? [];
  const suggestions = data?.suggestions ?? [];

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
        <Mono style={{ color: t.accent, textTransform: "uppercase", letterSpacing: 2 }}>What builders shipped</Mono>
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
    </ScrollView>
  );
}
