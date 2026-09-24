import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ROLES } from "@shared/constants";

import { PixelCoder } from "@/components/PixelCoder";
import { Avatar, Body, Button, Card, Display, ErrorText, Mono, StatusBadge, tap } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { DEMO_MESSAGE, MIN_PASSWORD, SITE_URL, isLive } from "@/lib/config";
import { setPhoto, setRoles } from "@/lib/data";
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
        <Avatar username={viewer.username} name={viewer.display_name} src={viewer.avatar_url} size={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <Display size={34} numberOfLines={1}>
            {viewer.display_name || `@${viewer.username}`}
          </Display>
          <Body muted>@{viewer.username}</Body>
          <StatusBadge roles={viewer.roles} />
        </View>
      </View>
      <PhotoCard />
      <StatusCard />
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

// Your profile photo: pick one (cropped square), change it or remove it.
function PhotoCard() {
  const { viewer, refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!viewer) return null;

  async function pick() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    setBusy(true);
    const r = await setPhoto(result.assets[0].uri);
    if (r.ok) await refresh();
    else setError(r.error);
    setBusy(false);
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const r = await setPhoto(null);
    if (r.ok) await refresh();
    else setError(r.error);
    setBusy(false);
  }

  return (
    <Card style={{ gap: 10 }}>
      <Body bold>Profile photo</Body>
      <Body muted size={13}>
        Shows next to your name everywhere on Method V.
      </Body>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label={viewer.avatar_url ? "Change photo" : "Add a photo"} busy={busy} onPress={() => void pick()} />
        {viewer.avatar_url && <Button label="Remove" kind="ghost" disabled={busy} onPress={() => void remove()} />}
      </View>
      <ErrorText>{error}</ErrorText>
    </Card>
  );
}

// Your status (Hiring, Looking for work…) and other tags. The status shows
// as a badge by your photo, so people know to connect and message you.
function StatusCard() {
  const t = useTheme();
  const { viewer, refresh } = useAuth();
  const [picked, setPicked] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  if (!viewer) return null;
  const roles = picked ?? viewer.roles;
  const changed = picked !== null && [...picked].sort().join() !== [...viewer.roles].sort().join();

  return (
    <Card style={{ gap: 10 }}>
      <Body bold>Your status</Body>
      <Body muted size={13}>
        Hiring, looking for work or open to collab? It shows next to your photo, and people connect and message you from there.
      </Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {ROLES.map((r) => {
          const on = roles.includes(r.slug);
          return (
            <Pressable
              key={r.slug}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => {
                tap();
                setMessage(null);
                setPicked(on ? roles.filter((x) => x !== r.slug) : [...roles, r.slug]);
              }}
              style={{
                borderWidth: 1,
                borderColor: on ? t.accent : t.line,
                backgroundColor: on ? t.accent : "transparent",
                borderRadius: 8,
                paddingHorizontal: 12,
                minHeight: 38,
                justifyContent: "center",
              }}
            >
              <Body size={14} bold={on} style={{ color: on ? t.accentInk : t.ink }}>
                {r.label}
              </Body>
            </Pressable>
          );
        })}
      </View>
      <Button
        label="Save status"
        kind="ghost"
        busy={busy}
        disabled={!changed}
        onPress={async () => {
          setBusy(true);
          const r = await setRoles(roles);
          if (r.ok) {
            await refresh();
            setPicked(null);
          }
          setBusy(false);
          setMessage(r.ok ? { ok: true, text: "Saved." } : { ok: false, text: r.error });
        }}
      />
      {message && (message.ok ? <Body size={13} style={{ color: t.accent }}>{message.text}</Body> : <ErrorText>{message.text}</ErrorText>)}
    </Card>
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
