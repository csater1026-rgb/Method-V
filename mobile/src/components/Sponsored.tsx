import { Pressable, View } from "react-native";

import type { SponsorCard } from "@shared/types";

import { openSponsor } from "@/lib/tryApp";
import { useTheme } from "@/theme";

import { Body, Display, Mono } from "./ui";

// Boost Exchange placements are always labeled Sponsored.
export function Sponsored({ sponsor, compact }: { sponsor: SponsorCard; compact?: boolean }) {
  const t = useTheme();
  const verb = sponsor.kind === "brand" ? "Visit" : "Try";
  if (compact) {
    return (
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Sponsored: ${verb} ${sponsor.name}`}
        onPress={() => void openSponsor(sponsor)}
        style={{ flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start", backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 7 }}
      >
        <Mono size={9} style={{ color: "rgba(255,255,255,0.7)", textTransform: "uppercase" }}>
          Sponsored
        </Mono>
        <Body bold size={12} style={{ color: "#fff" }}>
          {sponsor.name} →
        </Body>
      </Pressable>
    );
  }
  return (
    <View style={{ backgroundColor: t.surface2, borderColor: t.line, borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 }}>
      <Mono size={9} style={{ textTransform: "uppercase" }}>
        Sponsored · Boost Exchange
      </Mono>
      <Display size={28}>{sponsor.name}</Display>
      <Body muted size={13}>
        {sponsor.tagline}
      </Body>
      <Pressable accessibilityRole="link" onPress={() => void openSponsor(sponsor)} style={{ minHeight: 40, justifyContent: "center" }}>
        <Body bold style={{ color: t.accent }}>
          {verb} {sponsor.name} →
        </Body>
      </Pressable>
    </View>
  );
}
