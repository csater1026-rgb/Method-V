import { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CATEGORIES } from "@shared/constants";

import { AppCard } from "@/components/AppCard";
import { Body, Display, ErrorText } from "@/components/ui";
import { browseApps } from "@/lib/data";
import { useLoad } from "@/lib/useLoad";
import { fonts, useTheme } from "@/theme";

// Search and filter every app on Method V.
export default function BrowseScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | undefined>();
  const { data, error, refreshing, reload } = useLoad(() => browseApps({ q: query, category }), [query, category]);

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(a) => a.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: 32, gap: 14 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={t.muted} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Display size={52} style={{ paddingHorizontal: 16 }}>
            Browse
          </Display>
          <TextInput
            value={q}
            onChangeText={setQ}
            onSubmitEditing={() => setQuery(q)}
            returnKeyType="search"
            placeholder="Search apps"
            placeholderTextColor={t.muted}
            accessibilityLabel="Search apps"
            style={{ marginHorizontal: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, color: t.ink, borderRadius: 8, paddingHorizontal: 12, minHeight: 44, fontFamily: fonts.body, fontSize: 16 }}
          />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 16 }}>
            {[{ slug: undefined, label: "All" }, ...CATEGORIES].map((c) => {
              const on = category === c.slug;
              return (
                <Pressable
                  key={c.label}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setCategory(c.slug)}
                  style={{ borderWidth: 1, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accent : "transparent", borderRadius: 6, paddingHorizontal: 12, minHeight: 40, justifyContent: "center" }}
                >
                  <Body size={13} bold style={{ color: on ? t.accentInk : t.muted }}>
                    {c.label}
                  </Body>
                </Pressable>
              );
            })}
          </ScrollView>
          <ErrorText>{error}</ErrorText>
        </View>
      }
      renderItem={({ item }) => (
        <View style={{ paddingHorizontal: 16 }}>
          <AppCard app={item} />
        </View>
      )}
      ListEmptyComponent={data ? <Body muted style={{ paddingHorizontal: 16 }}>Nothing matches that yet.</Body> : null}
    />
  );
}
