import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";

import { APP_LIMIT } from "@shared/app-limit";
import { SPOTLIGHT, V_STORE } from "@shared/constants";

import { Body, Coin, Display, Mono, tap } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { DEMO_MESSAGE, SITE_URL } from "@/lib/config";
import { getMyStore } from "@/lib/data";
import { useLoad } from "@/lib/useLoad";
import { fonts, useColorSchemeName, useTheme } from "@/theme";

// The V Store, like the website's (/store): bright tiles with dark ink, each
// with a dark badge showing a big symbol, the name and the price. Mint in
// dark mode, the site's blue in light mode (the website's --shop-* colors).
// Tapping an item opens it; buying happens on the website, like buying
// Methodium, so the app never sells anything itself.
const SHOP = {
  dark: {
    ink: "#0b1b12",
    tile: ["#e2ffe9", "#a6f3bb"],
    featured: ["#b6f7c8", "#82ed9d", "#4fb86a"],
    border: "#82ed9d",
    featuredBorder: "#4fb86a",
    badge: "#0b1b12",
    badgeInk: "#82ed9d",
    badgeEdge: "#4fb86a",
  },
  light: {
    ink: "#0b1b2b",
    tile: ["#eef6ff", "#bcdcfb"],
    featured: ["#d6ebff", "#8cc4f5", "#4a9ce6"],
    border: "#8cc4f5",
    featuredBorder: "#0379d9",
    badge: "#0b1b2b",
    badgeInk: "#8fd3ff",
    badgeEdge: "#0379d9",
  },
} as const;
type Shop = (typeof SHOP)["dark" | "light"];

type Item = {
  id: string;
  symbol: string;
  kind: string;
  name: string;
  tag: string;
  cost: number;
  about: string;
  status: string | null;
  path: string;
};

const untilText = (iso: string) =>
  new Date(iso).getFullYear() > 2090 ? "forever (demo)" : `until ${new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`;

export default function StoreScreen() {
  const t = useTheme();
  const c = SHOP[useColorSchemeName()];
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { viewer } = useAuth();
  const { data } = useLoad(() => getMyStore(viewer?.id ?? null), [viewer?.id]);
  const [open, setOpen] = useState<Item | null>(null);

  const pro = data?.proUntil ?? null;
  const postsLeft = Math.max(V_STORE.appPost.perWindow - (data?.appPostsBought ?? 0), 0);
  const credits = viewer?.credits ?? 30;
  const web = (path: string) => SITE_URL && void WebBrowser.openBrowserAsync(`${SITE_URL}${path}`);

  const items: Item[] = [
    {
      id: "pro",
      symbol: "PRO",
      kind: "For your account",
      name: "Method V Pro",
      tag: pro ? `Pro ${untilText(pro)}` : `${V_STORE.pro.days} days`,
      cost: V_STORE.pro.cost,
      about: `Stats for 30 and 90 days, a pinned app on your profile, a Pro badge, and the Spotlight for ${SPOTLIGHT.proCost} Methodium instead of ${SPOTLIGHT.cost}. Lasts ${V_STORE.pro.days} days, no subscription.`,
      status: pro ? `You're Pro ${untilText(pro)}. Buying adds ${V_STORE.pro.days} more days.` : null,
      path: "/store",
    },
    {
      id: "spotlight",
      symbol: "★",
      kind: "For your app",
      name: "The Spotlight",
      tag: `${SPOTLIGHT.days} days on Home`,
      cost: pro ? SPOTLIGHT.proCost : SPOTLIGHT.cost,
      about: `Put your app on the stage at the top of Home for ${SPOTLIGHT.days} days. ${SPOTLIGHT.slots} spots, first come, first served.${pro ? "" : ` ${SPOTLIGHT.proCost} Methodium with Pro.`}`,
      status: null,
      path: "/store",
    },
    {
      id: "post",
      symbol: "+1",
      kind: "For your app",
      name: "Extra app post",
      tag: `Up to ${V_STORE.appPost.perWindow} a month`,
      cost: V_STORE.appPost.cost,
      about: `Post one more app past the limit of ${APP_LIMIT.perWindow} every ${APP_LIMIT.days} days. It's saved until you're at the limit, then used on your next app.`,
      status: data?.ready ? `You have ${data.extraAppPosts} saved. ${postsLeft} of ${V_STORE.appPost.perWindow} left to buy this month.` : null,
      path: "/store",
    },
  ];
  const [featured, ...upgrades] = items;

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 40, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 }}>
        <View>
          <Text style={{ fontFamily: fonts.eyebrow, fontSize: 11, letterSpacing: 1.6, color: t.accent, textTransform: "uppercase" }}>Spend your Methodium</Text>
          <Display size={58} style={{ transform: [{ skewX: "-6deg" }] }}>
            V STORE
          </Display>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${credits} Methodium. See your history`}
          onPress={() => web("/credits")}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 6 }}
        >
          <Coin size={22} />
          <Mono muted={false} size={22} style={{ fontFamily: fonts.monoBold }}>
            {credits}
          </Mono>
        </Pressable>
      </View>

      <Section title="Featured" />
      <Tile c={c} item={featured} big onPress={() => setOpen(featured)} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        {upgrades.map((item) => (
          <Tile key={item.id} c={c} item={item} style={{ flex: 1 }} onPress={() => setOpen(item)} />
        ))}
      </View>

      <Section title="Spend it on the community" />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Community c={c} symbol="◎" name="Bounties" body="Pay people to try your app or find bugs." tag="Earn or post" style={{ flex: 1 }} onPress={() => web("/test")} />
        <Community c={c} symbol="%" name="Perks" body="Deals on other builders' apps." tag="Deals" style={{ flex: 1 }} onPress={() => web("/credits#perks")} />
      </View>
      <Community c={c} symbol="♥" name="Tips" body="Tip a builder or tester." tag="Say thanks" onPress={() => router.push("/browse")} />

      <Body muted size={13}>
        Methodium can&apos;t be turned into money. Earn it with bounties, or buy a pack on the website.
      </Body>

      {open && <ItemSheet c={c} item={open} credits={credits} onClose={() => setOpen(null)} onBuy={() => web(open.path)} />}
    </ScrollView>
  );
}

function Section({ title }: { title: string }) {
  return (
    <Display size={32} style={{ marginTop: 8, transform: [{ skewX: "-6deg" }] }}>
      {title.toUpperCase()}
    </Display>
  );
}

// A tile's background: the same diagonal gradient as the website's.
function TileBg({ colors }: { colors: readonly string[] }) {
  // One gradient per color set, so tiles with different colors never share one.
  const id = `shop-${colors.join("-").replace(/#/g, "")}`;
  return (
    <Svg style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          {colors.map((col, i) => (
            <Stop key={col} offset={i / (colors.length - 1)} stopColor={col} />
          ))}
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${id})`} />
    </Svg>
  );
}

function Badge({ c, symbol, size }: { c: Shop; symbol: string; size: number }) {
  return (
    <View style={{ width: size, height: size + 3 }}>
      <View style={{ position: "absolute", top: 3, width: size, height: size, borderRadius: size * 0.28, backgroundColor: c.badgeEdge }} />
      <View style={{ width: size, height: size, borderRadius: size * 0.28, backgroundColor: c.badge, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ fontFamily: fonts.display, color: c.badgeInk, fontSize: symbol.length > 2 ? size * 0.4 : size * 0.52, includeFontPadding: false }}>{symbol}</Text>
      </View>
    </View>
  );
}

function Tag({ c, children }: { c: Shop; children: string }) {
  return (
    <View style={{ alignSelf: "flex-start", borderWidth: 1, borderColor: `${c.ink}33`, backgroundColor: "rgba(255,255,255,0.45)", borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
      <Mono size={9} style={{ color: c.ink, letterSpacing: 0.6, textTransform: "uppercase" }}>
        {children}
      </Mono>
    </View>
  );
}

function Price({ c, cost }: { c: Shop; cost: number }) {
  return (
    <View style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.badge, borderRadius: 999, paddingLeft: 6, paddingRight: 10, paddingVertical: 3 }}>
      <Coin size={14} />
      <Mono size={15} style={{ color: c.badgeInk, fontFamily: fonts.monoBold }}>
        {cost}
      </Mono>
    </View>
  );
}

function Tile({ c, item, big = false, style, onPress }: { c: Shop; item: Item; big?: boolean; style?: ViewStyle; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${item.cost} Methodium`}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [
        { minHeight: big ? 300 : 230, borderRadius: 18, borderWidth: 1, borderColor: big ? c.featuredBorder : c.border, overflow: "hidden", padding: 12, transform: [{ scale: pressed ? 0.98 : 1 }] },
        style,
      ]}
    >
      <TileBg colors={big ? c.featured : c.tile} />
      <Tag c={c}>{item.tag}</Tag>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12 }}>
        <Badge c={c} symbol={item.symbol} size={big ? 96 : 64} />
      </View>
      <Mono size={9} style={{ color: c.ink, opacity: 0.6, letterSpacing: 1.4, textTransform: "uppercase" }}>
        {item.kind}
      </Mono>
      <Display size={big ? 46 : 26} style={{ color: c.ink, marginTop: 2 }}>
        {item.name.toUpperCase()}
      </Display>
      <View style={{ marginTop: 8 }}>
        <Price c={c} cost={item.cost} />
      </View>
    </Pressable>
  );
}

function Community({ c, symbol, name, body, tag, style, onPress }: { c: Shop; symbol: string; name: string; body: string; tag: string; style?: ViewStyle; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={name}
      onPress={() => {
        tap();
        onPress();
      }}
      style={({ pressed }) => [{ minHeight: 200, borderRadius: 18, borderWidth: 1, borderColor: c.border, overflow: "hidden", padding: 12, transform: [{ scale: pressed ? 0.98 : 1 }] }, style]}
    >
      <TileBg colors={c.tile} />
      <Tag c={c}>{tag}</Tag>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 10 }}>
        <Badge c={c} symbol={symbol} size={58} />
      </View>
      <Display size={28} style={{ color: c.ink }}>
        {name.toUpperCase()}
      </Display>
      <Body size={12} style={{ color: c.ink, opacity: 0.7 }}>
        {body}
      </Body>
    </Pressable>
  );
}

function ItemSheet({ c, item, credits, onClose, onBuy }: { c: Shop; item: Item; credits: number; onClose: () => void; onBuy: () => void }) {
  const insets = useSafeAreaInsets();
  const short = credits < item.cost;
  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" }}>
        <Pressable onPress={() => {}} style={{ borderTopLeftRadius: 22, borderTopRightRadius: 22, overflow: "hidden", borderWidth: 1, borderColor: c.featuredBorder }}>
          <TileBg colors={c.featured} />
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={{ position: "absolute", top: 12, right: 14, padding: 6, zIndex: 1 }}>
            <Body style={{ color: c.ink, fontSize: 18 }}>✕</Body>
          </Pressable>
          <View style={{ alignItems: "center", paddingTop: 26, paddingBottom: 14 }}>
            <Badge c={c} symbol={item.symbol} size={84} />
          </View>
          <View style={{ backgroundColor: "rgba(255,255,255,0.35)", padding: 18, paddingBottom: insets.bottom + 20, gap: 8 }}>
            <Mono size={10} style={{ color: c.ink, opacity: 0.6, letterSpacing: 1.4, textTransform: "uppercase" }}>
              {item.kind} · {item.tag}
            </Mono>
            <Display size={44} style={{ color: c.ink }}>
              {item.name.toUpperCase()}
            </Display>
            <Body size={14} style={{ color: c.ink, opacity: 0.8 }}>
              {item.about}
            </Body>
            {item.status && (
              <Body bold size={14} style={{ color: c.ink }}>
                {item.status}
              </Body>
            )}
            {SITE_URL ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  tap();
                  onBuy();
                }}
                style={({ pressed }) => ({
                  alignSelf: "flex-start",
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 6,
                  backgroundColor: c.badge,
                  borderRadius: 10,
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 3,
                  borderBottomColor: c.badgeEdge,
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Body bold style={{ color: c.badgeInk }}>
                  Buy on the website ·
                </Body>
                <Coin size={16} />
                <Body bold style={{ color: c.badgeInk }}>
                  {item.cost} ↗
                </Body>
              </Pressable>
            ) : (
              <Body size={13} style={{ color: c.ink }}>
                {DEMO_MESSAGE}
              </Body>
            )}
            {short && (
              <Body size={12} style={{ color: c.ink, opacity: 0.8 }}>
                You have {credits}, so you need {item.cost - credits} more. Earn it with bounties, or get a pack on the website.
              </Body>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
