import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ROLES } from "@shared/constants";

import { PixelCoder } from "@/components/PixelCoder";
import { Avatar, Body, Button, Card, Display, ErrorText, Mono, StatusBadge, tap } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { DEMO_MESSAGE, MIN_PASSWORD, SITE_URL, isLive } from "@/lib/config";
import { setPhoto, setRoles } from "@/lib/data";
import { getPushKinds, pushIsOn, pushSupported, savePushKinds, turnOffPush, turnOnPush, type PushKinds } from "@/lib/push";
import { useLoad } from "@/lib/useLoad";
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
      <NotificationsCard />
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

// Push notifications on this phone, and which kinds. Off until turned on
// here; the kinds apply to every device (the website has the same switches).
const KINDS: { key: keyof PushKinds; label: string; hint: string }[] = [
  { key: "follows", label: "New followers", hint: "When someone follows you." },
  { key: "feedback", label: "Feedback on your apps", hint: "Tester feedback, comments and questions." },
  { key: "messages", label: "Messages", hint: "Direct messages and connection requests." },
];

function NotificationsCard() {
  const t = useTheme();
  const { viewer } = useAuth();
  const state = useLoad(
    async () => (viewer ? { on: await pushIsOn(), kinds: await getPushKinds(viewer.id) } : null),
    [viewer?.id],
  );
  const [on, setOn] = useState<boolean | null>(null);
  const [kinds, setKinds] = useState<PushKinds | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!viewer) return null;
  const isOn = on ?? state.data?.on ?? false;
  const current = kinds ?? state.data?.kinds ?? { follows: true, feedback: true, messages: true };

  async function toggleDevice() {
    setBusy(true);
    setError(null);
    const r = isOn ? await turnOffPush() : await turnOnPush();
    setBusy(false);
    if (r.ok) setOn(!isOn);
    else setError(r.error);
  }

  async function flip(key: keyof PushKinds) {
    const next = { ...current, [key]: !current[key] };
    setKinds(next);
    setError(null);
    const r = await savePushKinds(viewer!.id, next);
    if (!r.ok) {
      setKinds(current);
      setError(r.error);
    }
  }

  return (
    <Card style={{ gap: 10 }}>
      <Body bold>Notifications</Body>
      <Body muted size={13}>
        Optional. Get a notification when something happens, and pick which kinds.
      </Body>
      {pushSupported ? (
        <Button
          label={isOn ? "Turn off on this phone" : "Turn on notifications"}
          kind={isOn ? "ghost" : "accent"}
          busy={busy}
          onPress={() => void toggleDevice()}
        />
      ) : (
        <Body muted size={13}>
          Notifications work in the iPhone and Android app.
        </Body>
      )}
      {KINDS.map((k) => (
        <View key={k.key} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 }}>
          <View style={{ flex: 1 }}>
            <Body bold size={14}>
              {k.label}
            </Body>
            <Body muted size={12}>
              {k.hint}
            </Body>
          </View>
          <Switch
            value={current[k.key]}
            onValueChange={() => void flip(k.key)}
            accessibilityLabel={k.label}
            trackColor={{ true: t.accent, false: t.line }}
            thumbColor="#ffffff"
          />
        </View>
      ))}
      <ErrorText>{error}</ErrorText>
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
