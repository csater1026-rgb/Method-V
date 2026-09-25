import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "@/lib/auth";
import { useTheme } from "@/theme";

import { Body, Button, Display, Eyebrow } from "./ui";

// The first-time tour in the app: it moves through the real tabs (Home,
// Drops, +, Browse, Me), outlining each one in the tab bar with a short
// explanation. Skip any time. Starts once per account on this phone; the Me
// tab has "Take the tour" to play it again. Same steps as the website.

type Step = { title: string; body: string; route?: "/" | "/drops" | "/browse" | "/me"; tab?: number };

const STEPS: Step[] = [
  { title: "Welcome to Method V", body: "Real apps, real builders, real feedback. Here's a quick look around. It takes about 30 seconds.", route: "/" },
  { title: "Featured", body: "Hand-picked apps, launches and Spotlight apps sit up top on Home. Tap any card to open the app, try it and leave feedback.", route: "/", tab: 0 },
  { title: "Drops", body: "Swipe through 60-second demos. For you learns what you like, and Questions is where builders ask the community.", route: "/drops", tab: 1 },
  { title: "Post your app", body: "Tap + to share what you built with a 60-second Drop and get honest feedback from real testers.", tab: 2 },
  { title: "Browse", body: "Search every app, filter by category or tech stack, and find people by name.", route: "/browse", tab: 3 },
  { title: "You", body: "Your profile and Tester Passport, your photo and status, notifications, and your credits (earn them by testing apps).", route: "/me", tab: 4 },
  { title: "You're all set", body: "Start by testing an app to earn credits, or post your own.", route: "/" },
];

const TABS = 5;
const TAB_BAR = 68;
const doneKey = (id: string) => `method-v-tour-done:${id}`;

const TourContext = createContext<{ start: () => void }>({ start: () => {} });
export const useTour = () => useContext(TourContext);

export function TourProvider({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { viewer } = useAuth();
  const [step, setStep] = useState<number | null>(null);
  const viewerId = viewer?.id ?? null;
  // Checked once per account per launch, so a profile refresh can't restart it.
  const checked = useRef<string | null>(null);

  const go = useCallback(
    (i: number) => {
      setStep(i);
      const route = STEPS[i].route;
      if (route) router.navigate(route);
    },
    [router],
  );

  // The first time this account opens the app on this phone.
  useEffect(() => {
    if (!viewerId || checked.current === viewerId) return;
    checked.current = viewerId;
    void AsyncStorage.getItem(doneKey(viewerId)).then((done) => {
      if (done !== "1") go(0);
    });
  }, [viewerId, go]);

  const finish = useCallback(() => {
    if (viewerId) void AsyncStorage.setItem(doneKey(viewerId), "1");
    setStep(null);
  }, [viewerId]);

  const value = useMemo(() => ({ start: () => go(0) }), [go]);
  const current = step === null ? null : STEPS[step];
  const last = step === STEPS.length - 1;
  const barHeight = TAB_BAR + insets.bottom;
  const tabWidth = width / TABS;

  return (
    <TourContext.Provider value={value}>
      {children}
      {current && step !== null && (
        <View style={StyleSheet.absoluteFill} accessibilityViewIsModal>
          {/* Dim the screen above the tab bar; taps don't reach the app underneath. */}
          <Pressable style={[styles.scrim, { bottom: current.tab === undefined ? 0 : barHeight }]} accessible={false} />
          {current.tab === undefined ? null : (
            <>
              <Pressable style={[styles.blocker, { height: barHeight }]} accessible={false} />
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: tabWidth * current.tab + 4,
                  width: tabWidth - 8,
                  bottom: insets.bottom + 2,
                  height: TAB_BAR - 4,
                  borderWidth: 2,
                  borderColor: t.accent,
                  borderRadius: 12,
                }}
              />
            </>
          )}

          <View
            accessibilityRole="none"
            accessibilityLabel="Tour"
            style={{
              position: "absolute",
              left: 16,
              right: 16,
              bottom: current.tab === undefined ? undefined : barHeight + 14,
              top: current.tab === undefined ? "30%" : undefined,
              backgroundColor: t.surface,
              borderColor: t.line,
              borderWidth: 1,
              borderRadius: 16,
              padding: 18,
              gap: 8,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Eyebrow>{step === 0 ? "Quick tour" : last ? "Done" : `${step} of ${STEPS.length - 2}`}</Eyebrow>
              <Pressable onPress={finish} hitSlop={10} accessibilityRole="button" accessibilityLabel={last ? "Close" : "Skip tour"}>
                <Body muted size={13}>
                  {last ? "Close" : "Skip tour"}
                </Body>
              </Pressable>
            </View>
            <Display size={32}>{current.title}</Display>
            <Body>{current.body}</Body>
            {step > 0 && !last && (
              <View style={{ flexDirection: "row", gap: 4, marginTop: 4 }}>
                {STEPS.slice(1, -1).map((s, i) => (
                  <View key={s.title} style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: i < step ? t.accent : t.line }} />
                ))}
              </View>
            )}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {last ? (
                <Button label="Let's go" onPress={finish} />
              ) : (
                <>
                  <Button label={step === 0 ? "Start the tour" : "Next"} onPress={() => go(step + 1)} />
                  {step > 0 && <Button label="Back" kind="ghost" onPress={() => go(step - 1)} />}
                </>
              )}
            </View>
          </View>
        </View>
      )}
    </TourContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", left: 0, right: 0, top: 0, backgroundColor: "rgba(0,0,0,0.6)" },
  blocker: { position: "absolute", left: 0, right: 0, bottom: 0 },
});
