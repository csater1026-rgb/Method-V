import { ActivityIndicator, View } from "react-native";

import { useTheme } from "@/theme";

// A plain spinner while a screen loads. (The pixel art mascot is only on the
// website.)
export function Loading({ label = "Loading…" }: { label?: string }) {
  const t = useTheme();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={label} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
      <ActivityIndicator size="large" color={t.accent} />
    </View>
  );
}
