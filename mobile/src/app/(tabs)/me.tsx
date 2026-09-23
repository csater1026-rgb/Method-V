import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PixelCoder } from "@/components/PixelCoder";
import { Avatar, Body, Button, Card, Display, ErrorText, Mono } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { DEMO_MESSAGE, MIN_PASSWORD, SITE_URL, isLive } from "@/lib/config";
import { fonts, useTheme } from "@/theme";

// Your account. Deeper tools (credits, Earn, Pro, stats) open on the website
// for now, in an in-app browser.
export default function MeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { viewer, signOut } = useAuth();
  const web = (path: string) => SITE_URL && void WebBrowser.openBrowserAsync(`${SITE_URL}${path}`);

  if (!viewer) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16, paddingTop: insets.top, backgroundColor: t.bg }}>
        <PixelCoder size={140} />
        <Display size={40} style={{ textAlign: "center" }}>
          Your Method V
        </Display>
        <Body muted style={{ textAlign: "center" }}>
          {isLive ? "Sign in to post, like, follow and see your profile." : DEMO_MESSAGE}
        </Body>
        {isLive ? (
          <Button label="Sign in" onPress={() => router.push("/sign-in")} />
        ) : (
          <Button label="See a sample profile" kind="ghost" onPress={() => router.push("/u/ada_builds")} />
        )}
      </View>
    );
  }

  const links: [string, string][] = [
    ["Stats", "/dashboard"],
    ["Earn", "/earn"],
    ["Credits", "/credits"],
    ["Inbox", "/inbox"],
    ["Edit profile", "/settings"],
  ];

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: insets.top + 16, padding: 16, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar username={viewer.username} name={viewer.display_name} size={64} />
        <View style={{ flex: 1 }}>
          <Display size={34} numberOfLines={1}>
            {viewer.display_name || `@${viewer.username}`}
          </Display>
          <Body muted>@{viewer.username}</Body>
        </View>
      </View>
      <Mono muted={false}>⚡{viewer.credits} credits</Mono>
      <Button label="View your profile" onPress={() => router.push(`/u/${viewer.username}`)} />
      {SITE_URL ? (
        <Card style={{ gap: 4 }}>
          {links.map(([label, path]) => (
            <Button key={path} label={`${label} ↗`} kind="ghost" onPress={() => web(path)} style={{ borderWidth: 0, justifyContent: "flex-start" }} />
          ))}
        </Card>
      ) : null}
      <PasswordCard />
      <Button label="Sign out" kind="ghost" onPress={() => void signOut()} />
    </ScrollView>
  );
}

// Set or change your password (also how "forgot password" ends: sign in
// with an emailed code, then pick a new one here).
function PasswordCard() {
  const t = useTheme();
  const { setPassword } = useAuth();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <Card style={{ gap: 10 }}>
      <Body bold>Password</Body>
      <Body muted size={13}>
        Set a new password for signing in with your email.
      </Body>
      <TextInput
        value={value}
        onChangeText={setValue}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        placeholder={`New password (${MIN_PASSWORD}+ characters)`}
        placeholderTextColor={t.muted}
        accessibilityLabel="New password"
        style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.bg, color: t.ink, borderRadius: 8, paddingHorizontal: 12, minHeight: 44, fontFamily: fonts.body, fontSize: 16 }}
      />
      <Button
        label="Save password"
        kind="ghost"
        busy={busy}
        disabled={!value}
        onPress={async () => {
          setBusy(true);
          const r = await setPassword(value);
          setBusy(false);
          setMessage(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
          if (r.ok) setValue("");
        }}
      />
      {message && (message.ok ? <Body size={13} style={{ color: t.accent }}>{message.text}</Body> : <ErrorText>{message.text}</ErrorText>)}
    </Card>
  );
}
