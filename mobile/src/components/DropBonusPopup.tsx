import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Modal, Pressable, View } from "react-native";

import { getPromotion } from "@/lib/data";
import { useLoad } from "@/lib/useLoad";
import { useTheme } from "@/theme";

import { useTour } from "./Tour";
import { Body, Button, Coin, Display, Eyebrow } from "./ui";

// Same key and rule as the website (src/components/DropBonusPopup.tsx): it
// remembers the promotion's end date, so closing it hides this run for good
// but a new run shows again.
const seenKey = (slug: string) => `method-v-promo-seen:${slug}`;

// "Post a Drop, get +10 Methodium" as a pop-up the first time someone opens Home
// while the promotion runs, after the first-time tour. Post a Drop opens the
// + tab; ✕ or Not now closes it.
export function DropBonusPopup() {
  const t = useTheme();
  const router = useRouter();
  const { busy } = useTour();
  const { data: promo } = useLoad(() => getPromotion("drop_bonus"), []);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!promo || busy) return;
    let live = true;
    void AsyncStorage.getItem(seenKey(promo.slug)).then((seen) => {
      if (live && seen !== promo.ends_at) setOpen(true);
    });
    return () => {
      live = false;
    };
  }, [promo, busy]);

  if (!promo || !open) return null;
  const close = () => {
    void AsyncStorage.setItem(seenKey(promo.slug), promo.ends_at);
    setOpen(false);
  };
  const ends = new Date(promo.ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });

  return (
    <Modal transparent animationType="fade" visible onRequestClose={close}>
      <Pressable accessible={false} onPress={close} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20 }}>
        <Pressable
          accessibilityViewIsModal
          // Taps on the card itself don't close it.
          onPress={() => {}}
          style={{ backgroundColor: "#070d16", borderColor: t.accent, borderWidth: 1, borderRadius: 18, padding: 22, alignItems: "center", gap: 10 }}
        >
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={10} style={{ position: "absolute", top: 12, right: 14, padding: 6 }}>
            <Body style={{ color: "rgba(255,255,255,0.7)", fontSize: 18 }}>✕</Body>
          </Pressable>
          <Eyebrow>For a limited time</Eyebrow>
          <View style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: t.accent, alignItems: "center", justifyContent: "center" }}>
            <Coin size={32} />
          </View>
          <Display size={40} style={{ color: "#fff", textAlign: "center" }}>
            Post a Drop, get +{promo.amount} Methodium
          </Display>
          <Body size={14} style={{ color: "rgba(255,255,255,0.8)", textAlign: "center" }}>
            Share a 60-second demo of what you built and we&apos;ll add {promo.amount} Methodium to your account. Spend it in the V Store, like a Spotlight spot
            at the top of Home.
          </Body>
          <Body size={12} style={{ color: "rgba(255,255,255,0.6)", textAlign: "center" }}>
            Until {ends}: one bonus per app, up to {promo.per_day} a day.
          </Body>
          <Button
            label="Post a Drop →"
            onPress={() => {
              close();
              router.push("/post");
            }}
            style={{ alignSelf: "stretch", marginTop: 6 }}
          />
          <Pressable accessibilityRole="button" onPress={close} style={{ padding: 8 }}>
            <Body style={{ color: "rgba(255,255,255,0.7)" }}>Not now</Body>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
