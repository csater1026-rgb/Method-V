import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Avatar, Body, Button, Card, Display, ErrorText, Eyebrow, Mono, Wordmark } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { checkUsername, claimUsername, setPhoto } from "@/lib/data";
import { pushSupported, turnOnPush } from "@/lib/push";
import { skipProfileSetup, useProfileSetupSkipped } from "@/lib/welcome";
import { fonts, useTheme } from "@/theme";
import { USERNAME_HINT, USERNAME_PATTERN, isDefaultUsername, suggestUsername } from "@shared/username";

// Right after the first sign-in (and the Terms), before the tour: a real
// username instead of builder_1a2b3c…, their name, and a photo if they like.
// Same as the website's /welcome. Shown until they save or skip (see _layout).
export default function WelcomeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { viewer, session, refresh } = useAuth();
  const meta = (session?.user.user_metadata ?? {}) as Record<string, unknown>;
  const metaName = [meta.display_name, meta.full_name, meta.name].find((v): v is string => typeof v === "string" && v.trim() !== "") ?? "";
  const startName = viewer?.display_name || metaName;
  const [username, setUsername] = useState(() => suggestUsername(startName, session?.user.email ?? null));
  const [displayName, setDisplayName] = useState(startName);
  const [result, setResult] = useState<{ value: string; ok: boolean; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [notify, setNotify] = useState<"ask" | "busy" | "on">("ask");
  const [error, setError] = useState<string | null>(null);

  const value = username.trim().toLowerCase();
  const shapeOk = USERNAME_PATTERN.test(value);
  const viewerId = viewer?.id ?? null;

  // Saved (a real username now) or skipped: on to the app, where the tour starts.
  const router = useRouter();
  const skipped = useProfileSetupSkipped(viewerId);
  const done = !!viewer && (!isDefaultUsername(viewer.username) || skipped === true);
  useEffect(() => {
    if (done) router.replace("/");
  }, [done, router]);

  // Asks whether it's free a moment after they stop typing.
  useEffect(() => {
    if (!shapeOk || !viewerId) return;
    let stale = false;
    const timer = setTimeout(async () => {
      const r = await checkUsername(value, viewerId);
      if (!stale) setResult({ value, ok: r.ok, message: r.ok ? `@${value} is yours if you want it.` : r.error });
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [value, shapeOk, viewerId]);

  const check = !value
    ? { tone: t.muted, text: USERNAME_HINT, ok: false }
    : !shapeOk
      ? { tone: t.danger, text: `Usernames are ${USERNAME_HINT}`, ok: false }
      : result?.value === value
        ? { tone: result.ok ? t.accent : t.danger, text: result.message, ok: result.ok }
        : { tone: t.muted, text: "Checking…", ok: false };

  if (!viewer) return null;

  async function save() {
    setBusy(true);
    setError(null);
    const r = await claimUsername(username, displayName);
    if (!r.ok) {
      setBusy(false);
      return setError(r.error);
    }
    // The new username arrives with the refreshed profile, and the app opens up.
    await refresh();
    setBusy(false);
  }

  async function pickPhoto() {
    setError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
    if (picked.canceled || !picked.assets[0]) return;
    setPhotoBusy(true);
    const r = await setPhoto(picked.assets[0].uri);
    if (r.ok) await refresh();
    else setError(r.error);
    setPhotoBusy(false);
  }

  async function turnOnNotifications() {
    setError(null);
    setNotify("busy");
    const r = await turnOnPush();
    setNotify(r.ok ? "on" : "ask");
    if (!r.ok) setError(r.error);
  }

  const input = { borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, color: t.ink, borderRadius: 8, paddingHorizontal: 12, minHeight: 48, fontSize: 16 } as const;

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: insets.top + 32, padding: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Wordmark size={26} />
      <Eyebrow>Welcome to Method V</Eyebrow>
      <Display size={42}>Set up your profile</Display>
      <Body muted>Pick the name people will see on your apps, feedback and questions. You can change it later on the Me tab or the website.</Body>

      <Mono>Profile photo</Mono>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar username={value || viewer.username} name={displayName} src={viewer.avatar_url} size={64} />
        <View style={{ flex: 1, gap: 6, alignItems: "flex-start" }}>
          <Button label={viewer.avatar_url ? "Change photo" : "Add a photo"} kind={viewer.avatar_url ? "ghost" : "accent"} busy={photoBusy} onPress={() => void pickPhoto()} />
          <Body muted size={12}>
            Optional, but recommended. It shows next to your name on your apps, Drops, feedback and questions.
          </Body>
        </View>
      </View>

      <Mono>Username</Mono>
      <View style={[input, { flexDirection: "row", alignItems: "center" }]}>
        <Body muted style={{ fontFamily: fonts.mono }}>@</Body>
        <TextInput
          value={username}
          onChangeText={(v) => setUsername(v.toLowerCase().replace(/\s+/g, "_"))}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={24}
          placeholder="your_name"
          placeholderTextColor={t.muted}
          accessibilityLabel="Username"
          style={{ flex: 1, color: t.ink, fontFamily: fonts.mono, fontSize: 16, paddingLeft: 2, minHeight: 46 }}
        />
      </View>
      <Body size={13} style={{ color: check.tone }} accessibilityLiveRegion="polite">
        {check.text}
      </Body>

      <Mono>Your name · optional</Mono>
      <TextInput
        value={displayName}
        onChangeText={setDisplayName}
        maxLength={60}
        placeholder="Maya Chen"
        placeholderTextColor={t.muted}
        accessibilityLabel="Your name"
        style={[input, { fontFamily: fonts.body }]}
      />

      {pushSupported && (
        <Card style={{ gap: 8 }}>
          <Body bold>Want notifications?</Body>
          <Body muted size={13}>
            Hear right away when someone follows you, gives feedback on your app, or messages you. Optional, and you can change it any time on
            the Me tab.
          </Body>
          {notify === "on" ? (
            <Body size={14} style={{ color: t.accent }}>
              Notifications are on ✓
            </Body>
          ) : (
            <Button label="Yes, turn on notifications" kind="ghost" busy={notify === "busy"} onPress={() => void turnOnNotifications()} />
          )}
        </Card>
      )}

      <ErrorText>{error}</ErrorText>
      <Button label="Save and continue" onPress={() => void save()} busy={busy} disabled={!check.ok} />
      <Button label="Skip for now" kind="ghost" disabled={busy} onPress={() => void skipProfileSetup(viewer.id)} />
    </ScrollView>
  );
}
