import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import Svg, { Defs, Ellipse, LinearGradient, Path, Polygon, RadialGradient, Rect, Stop } from "react-native-svg";

import { STAGE_SPOTS } from "@shared/spotlight-stage";
import type { AppCard as Card, FeaturedReason } from "@shared/types";

import { AppCard } from "./AppCard";
import { Body, Display, Tag } from "./ui";

type StageApp = Card & { reason: FeaturedReason };

const LABELS: Record<FeaturedReason, string> = {
  featured: "In the Spotlight",
  launch: "Launch day",
  boosted: "Spotlight",
  pick: "Today's pick",
  hot: "Hot",
};

// The Spotlight on Home, like the website: a dark stage under a lighting
// rig, one app on top under the big lamp and three under it, light falling
// on each. Paid Spotlights come first (see src/lib/spotlight-stage.ts).
export function SpotlightStage({ apps }: { apps: StageApp[] }) {
  const router = useRouter();
  const [top, ...rest] = apps;
  const under = rest.slice(0, STAGE_SPOTS - 1);
  if (!top) return null;
  return (
    <View style={{ marginHorizontal: 16, borderRadius: 16, overflow: "hidden", backgroundColor: "#070d16", borderWidth: 1, borderColor: "#243a50" }}>
      <Truss />
      <View style={{ alignItems: "center", marginTop: -2 }}>
        <Lamp big />
      </View>
      <View style={{ paddingHorizontal: 12 }}>
        <View>
          <AppCard app={top} />
          <Beam />
          <View style={{ position: "absolute", top: 10, left: 10 }}>
            <Tag tone="accent">★ {LABELS[top.reason]}</Tag>
          </View>
        </View>
      </View>
      {under.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, padding: 12, paddingTop: 20 }}>
          {under.map((app) => (
            <View key={app.id} style={{ alignItems: "center" }}>
              <Lamp />
              <View>
                <AppCard app={app} wide />
                <Beam />
                <View style={{ position: "absolute", top: 8, left: 8 }}>
                  <Tag tone="accent">{LABELS[app.reason]}</Tag>
                </View>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
      {under.length < STAGE_SPOTS - 1 && (
        <Pressable accessibilityRole="link" onPress={() => router.push("/post")} style={{ margin: 12, marginTop: under.length ? 0 : 12, borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(255,255,255,0.25)", borderRadius: 12, padding: 14, alignItems: "center" }}>
          <Display size={24} style={{ color: "#fff" }}>
            This spot is open
          </Display>
          <Body size={13} style={{ color: "rgba(255,255,255,0.75)" }}>
            Book the Spotlight on your app&apos;s page
          </Body>
        </Pressable>
      )}
    </View>
  );
}

function Truss() {
  return (
    <Svg width="100%" height={14} viewBox="0 0 400 14" preserveAspectRatio="none">
      <Rect width={400} height={14} fill="#111c29" />
      {Array.from({ length: 26 }, (_, i) => (
        <Path key={i} d={`M${i * 16} 2 L${i * 16 + 16} 12 M${i * 16} 12 L${i * 16 + 16} 2`} stroke="#2b3b4f" strokeWidth={1.5} />
      ))}
      <Rect width={400} height={2} fill="#3a4d63" />
      <Rect y={12} width={400} height={2} fill="#3a4d63" />
    </Svg>
  );
}

function Lamp({ big = false }: { big?: boolean }) {
  const w = big ? 56 : 36;
  return (
    <Svg width={w} height={w * 1.15} viewBox="0 0 64 74">
      <Defs>
        <RadialGradient id="lens" cx="50%" cy="40%" r="60%">
          <Stop offset="0" stopColor="#fffbe8" />
          <Stop offset="0.5" stopColor="#ffe7a8" />
          <Stop offset="1" stopColor="#f2b84b" />
        </RadialGradient>
      </Defs>
      {big && <Rect x={31} y={0} width={2} height={20} fill="#3a4d63" />}
      <Path d="M14 22 Q32 14 50 22 L56 54 Q32 62 8 54 Z" fill="#1d2a3a" stroke="#4a6078" strokeWidth={1.5} />
      <Ellipse cx={32} cy={55} rx={22} ry={6} fill="url(#lens)" />
      <Ellipse cx={32} cy={57} rx={28} ry={9} fill="#ffe7a8" opacity={0.35} />
    </Svg>
  );
}

// Warm light covering the whole card (doesn't catch taps): a glow over all of
// it, plus two cones from the lamp (a wide faint one and a narrower bright
// one) so the edges of the light look soft.
function Beam() {
  return (
    <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="glow" cx="50%" cy="0%" rx="85%" ry="100%" fx="50%" fy="0%">
            <Stop offset="0" stopColor="#ffecba" stopOpacity={0.26} />
            <Stop offset="0.6" stopColor="#ffecba" stopOpacity={0.1} />
            <Stop offset="1" stopColor="#ffecba" stopOpacity={0.02} />
          </RadialGradient>
          <LinearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#ffecba" stopOpacity={0.3} />
            <Stop offset="0.45" stopColor="#ffecba" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#ffecba" stopOpacity={0.08} />
          </LinearGradient>
        </Defs>
        <Rect width={100} height={100} fill="url(#glow)" />
        <Polygon points="28,0 72,0 100,100 0,100" fill="url(#beam)" opacity={0.6} />
        <Polygon points="36,0 64,0 92,100 8,100" fill="url(#beam)" />
      </Svg>
    </View>
  );
}
