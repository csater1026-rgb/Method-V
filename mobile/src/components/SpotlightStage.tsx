import { useRouter } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import Svg, {
  Defs,
  LinearGradient,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";

import { STAGE_SPOTS } from "@shared/spotlight-stage";
import type { AppCard as Card, FeaturedReason } from "@shared/types";

import { MediaDark, fonts, useColorSchemeName } from "@/theme";

import { AppCard } from "./AppCard";
import { Body, Display } from "./ui";

type StageApp = Card & { reason: FeaturedReason };

// Solid behind each card, so the light only shows around it.
const CARD_BG = "#0b1626";

const LABELS: Record<FeaturedReason, string> = {
  featured: "In the Spotlight",
  launch: "Launch day",
  boosted: "Spotlight",
  pick: "Today's pick",
  hot: "Hot",
};

// The Spotlight on Home, like the website: a night stage with a light rail
// on top, one app on top under the big light and three under it. The light
// falls behind the apps (so they stay crisp) in the brand's cyan; paid
// Spotlights wear a gold tag, Today's picks a quiet glass one. Paid
// Spotlights come first (see src/lib/spotlight-stage.ts).
// The stage's light: mint in dark mode, cyan in light mode (like the website).
function useGlow() {
  const dark = useColorSchemeName() === "dark";
  return dark
    ? { hex: "#82ed9d", rgb: "130,237,157", hi: "#e8ffee" }
    : { hex: "#40f4f5", rgb: "64,244,245", hi: "#e1feff" };
}

export function SpotlightStage({ apps }: { apps: StageApp[] }) {
  const g = useGlow();
  const router = useRouter();
  const [top, ...rest] = apps;
  const under = rest.slice(0, STAGE_SPOTS - 1);
  if (!top) return null;
  return (
    <MediaDark>
      <View
        style={{
          marginHorizontal: 16,
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: "#070e19",
          borderWidth: 1,
          borderColor: `rgba(${g.rgb},0.25)`,
        }}
      >
        <Glow />
        <Rail top={30} />
        <View style={{ paddingHorizontal: 12, paddingTop: 72 }}>
          <Beam style={{ top: 34, left: -24, right: -24, bottom: -16 }} wide />
          <Light
            big
            style={{ position: "absolute", top: 24, alignSelf: "center" }}
          />
          <View
            style={{
              borderRadius: 13,
              borderWidth: 1,
              borderColor: `rgba(${g.rgb},0.75)`,
              backgroundColor: CARD_BG,
              shadowColor: g.hex,
              shadowOpacity: 0.5,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 8 },
            }}
          >
            <AppCard app={top} />
          </View>
          <View style={{ position: "absolute", top: 82, left: 22 }}>
            <SpotTag reason={top.reason} />
          </View>
        </View>
        {under.length > 0 && (
          <>
            <Rail style={{ marginTop: 30 }} />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{
                gap: 12,
                paddingHorizontal: 12,
                paddingBottom: 18,
              }}
            >
              {under.map((app) => (
                <View key={app.id} style={{ paddingTop: 40 }}>
                  <Beam
                    style={{ top: 6, left: -16, right: -16, bottom: -10 }}
                  />
                  <Light
                    style={{
                      position: "absolute",
                      top: 0,
                      alignSelf: "center",
                    }}
                  />
                  <View
                    style={{
                      borderRadius: 12,
                      backgroundColor: CARD_BG,
                      shadowColor: g.hex,
                      shadowOpacity: 0.35,
                      shadowRadius: 12,
                      shadowOffset: { width: 0, height: 6 },
                    }}
                  >
                    <AppCard app={app} wide />
                  </View>
                  <View style={{ position: "absolute", top: 48, left: 8 }}>
                    <SpotTag reason={app.reason} />
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        )}
        {under.length < STAGE_SPOTS - 1 && (
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push("/post")}
            style={{
              margin: 12,
              marginTop: under.length ? 0 : 24,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: `rgba(${g.rgb},0.35)`,
              borderRadius: 12,
              padding: 14,
              alignItems: "center",
            }}
          >
            <Display size={24} style={{ color: "#fff" }}>
              This spot is open
            </Display>
            <Body size={13} style={{ color: "rgba(255,255,255,0.75)" }}>
              Book the Spotlight on your app&apos;s page
            </Body>
          </Pressable>
        )}
      </View>
    </MediaDark>
  );
}

// Gold for a paid Spotlight, glass for everything else.
function SpotTag({ reason }: { reason: FeaturedReason }) {
  const g = useGlow();
  const gold = reason === "boosted";
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: gold ? "#f5b93b" : `rgba(${g.rgb},0.5)`,
        backgroundColor: gold ? "#f8c94f" : "rgba(7,14,25,0.75)",
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
      }}
    >
      <Text
        style={{
          fontFamily: fonts.mono,
          fontSize: 10,
          textTransform: "uppercase",
          color: gold ? "#2a1a00" : "#dffcff",
        }}
      >
        {gold ? "★ " : ""}
        {LABELS[reason]}
      </Text>
    </View>
  );
}

// A soft cyan glow from the top of the stage.
function Glow() {
  const g = useGlow();
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, height: 260 }}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <Defs>
          <RadialGradient
            id="stageGlow"
            cx="50%"
            cy="0%"
            rx="70%"
            ry="100%"
            fx="50%"
            fy="0%"
          >
            <Stop offset="0" stopColor={g.hex} stopOpacity={0.22} />
            <Stop offset="1" stopColor={g.hex} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect width={100} height={100} fill="url(#stageGlow)" />
      </Svg>
    </View>
  );
}

// The thin rail the lights hang on.
function Rail({ top, style }: { top?: number; style?: object }) {
  const g = useGlow();
  return (
    <View
      pointerEvents="none"
      style={[
        { height: 1, marginHorizontal: 20 },
        top != null ? { position: "absolute", top, left: 0, right: 0 } : null,
        style,
      ]}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 1"
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="rail" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor="#ffffff" stopOpacity={0} />
            <Stop offset="0.5" stopColor={g.hex} stopOpacity={0.6} />
            <Stop offset="1" stopColor="#ffffff" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={100} height={1} fill="url(#rail)" />
      </Svg>
    </View>
  );
}

// A small light on the rail: a dark housing with a glowing strip.
function Light({ big = false, style }: { big?: boolean; style?: object }) {
  const g = useGlow();
  return (
    <View
      pointerEvents="none"
      style={[
        {
          width: big ? 72 : 46,
          height: big ? 12 : 10,
          borderRadius: 999,
          backgroundColor: "#142235",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          zIndex: 2,
        },
        style,
      ]}
    >
      <View
        style={{
          position: "absolute",
          left: "18%",
          right: "18%",
          bottom: -1,
          height: 3,
          borderRadius: 999,
          backgroundColor: g.hi,
          shadowColor: g.hex,
          shadowOpacity: 1,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
    </View>
  );
}

// Cool light falling from the light, behind the card (doesn't catch taps).
function Beam({ style, wide = false }: { style: object; wide?: boolean }) {
  const g = useGlow();
  return (
    <View pointerEvents="none" style={[{ position: "absolute" }, style]}>
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="beam" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={g.hi} stopOpacity={0.38} />
            <Stop offset="0.45" stopColor={g.hex} stopOpacity={0.14} />
            <Stop offset="1" stopColor={g.hex} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {/* Three cones, wide and faint to narrow and bright, so the edges fade. */}
        <Polygon
          points={wide ? "26,0 74,0 100,100 0,100" : "20,0 80,0 100,100 0,100"}
          fill="url(#beam)"
          opacity={0.35}
        />
        <Polygon
          points={wide ? "34,0 66,0 96,100 4,100" : "28,0 72,0 96,100 4,100"}
          fill="url(#beam)"
          opacity={0.6}
        />
        <Polygon
          points={wide ? "41,0 59,0 90,100 10,100" : "36,0 64,0 90,100 10,100"}
          fill="url(#beam)"
        />
      </Svg>
    </View>
  );
}
