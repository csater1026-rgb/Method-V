import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AppCard } from "@/components/AppCard";
import { Loading } from "@/components/PixelCoder";
import { Body, Display, ErrorText, Mono, Wordmark } from "@/components/ui";
import { isLive } from "@/lib/config";
import { getHome } from "@/lib/data";
import { useLoad } from "@/lib/useLoad";
import { useTheme } from "@/theme";

// Home: Featured up top, then everybody's projects.
export default function HomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { data, error, refreshing, reload } = useLoad(getHome, []);

  if (!data && !error) return <Loading />;

  return (
    <FlatList
      data={data?.apps ?? []}
      keyExtractor={(a) => a.id}
      contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={t.muted} />}
      ListHeaderComponent={
        <View style={{ gap: 14 }}>
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
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
            {(data?.featured ?? []).map((app) => (
              <AppCard key={app.id} app={app} wide />
            ))}
          </ScrollView>
          <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
            <Display size={36}>All projects</Display>
            <Body muted size={13}>
              Newest first. Tap one to see its Drop and try it.
            </Body>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <View style={{ paddingHorizontal: 16 }}>
          <AppCard app={item} />
        </View>
      )}
      ListEmptyComponent={<Body muted style={{ paddingHorizontal: 16 }}>No apps yet. Be the first to post one.</Body>}
    />
  );
}
