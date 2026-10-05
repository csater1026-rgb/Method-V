import * as WebBrowser from "expo-web-browser";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Body, Button, Display, ErrorText, Eyebrow, Wordmark } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { SITE_URL } from "@/lib/config";
import { useTheme } from "@/theme";
import { hasAgreedToTerms } from "@shared/gate";

// Shown once, after the first sign-in, to anyone who hasn't agreed to the
// Terms yet: people who signed up with Google or Apple (they never saw the
// sign-up box), and accounts from before it existed. Same as the website's
// /agree. The rest of the app stays locked until they agree (see _layout).
export default function AgreeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { agreeToTerms, signOut, session } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once the new session (with the agreement) arrives, the app opens up.
  const done = hasAgreedToTerms(session?.user.user_metadata);
  useEffect(() => {
    if (done) router.replace("/");
  }, [done, router]);

  const open = (path: string) => SITE_URL && void WebBrowser.openBrowserAsync(`${SITE_URL}${path}`);
  const link = (path: string, label: string) =>
    SITE_URL ? (
      <Body size={14} accessibilityRole="link" style={{ color: t.accent }} onPress={() => open(path)}>
        {label}
      </Body>
    ) : (
      label
    );

  async function agree() {
    setBusy(true);
    setError(null);
    const r = await agreeToTerms();
    setBusy(false);
    if (!r.ok) setError(r.error);
  }

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: insets.top + 32, padding: 24, gap: 14 }}>
      <Wordmark size={26} />
      <Eyebrow>Welcome to Method V</Eyebrow>
      <Display size={42}>One more step</Display>
      <Body muted>Before you start, please read and agree to how Method V works: the rules, Methodium, payments, and what we do with your data.</Body>

      <Pressable
        accessibilityRole="checkbox"
        aria-checked={agreed}
        accessibilityLabel="I'm at least 13 and I agree to the Terms of Service and Privacy Policy"
        onPress={() => setAgreed((a) => !a)}
        style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            borderWidth: 2,
            borderColor: agreed ? t.accent : t.line,
            backgroundColor: agreed ? t.accent : "transparent",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {agreed ? (
            <Body bold size={14} style={{ color: t.accentInk, lineHeight: 16 }}>
              ✓
            </Body>
          ) : null}
        </View>
        <Body size={14} style={{ flex: 1 }}>
          I&apos;m at least 13 and I agree to the {link("/terms", "Terms of Service")} and {link("/privacy", "Privacy Policy")}.
        </Body>
      </Pressable>

      <Button label="Agree and continue" onPress={() => void agree()} busy={busy} disabled={!agreed} />
      <ErrorText>{error}</ErrorText>
      <Button label="Sign out" kind="ghost" onPress={() => void signOut()} />
    </ScrollView>
  );
}
