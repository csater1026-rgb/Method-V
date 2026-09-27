import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { Pressable, ScrollView, Switch, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { confirmMatches } from "@shared/account";
import { ROLES } from "@shared/constants";

import { Avatar, Body, Button, Card, Coin, Display, ErrorText, Handle, Mono, StatusBadge, tap } from "@/components/ui";
import { useTour } from "@/components/Tour";
import { useAuth } from "@/lib/auth";
import { DEMO_MESSAGE, MIN_PASSWORD, SITE_URL, isLive } from "@/lib/config";
import { getMyAbout, getMyCover, saveAbout, setCover, setPhoto, setRoles, type About } from "@/lib/data";
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
  const tour = useTour();
  const web = (path: string) => SITE_URL && void WebBrowser.openBrowserAsync(`${SITE_URL}${path}`);

  if (!viewer) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16, paddingTop: insets.top, backgroundColor: t.bg }}>
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
        <Button label="Take the tour" kind="ghost" onPress={tour.start} />
      </View>
    );
  }

  const links: [string, string][] = [
    ["Stats", "/dashboard"],
    ["Earn", "/earn"],
    ["V Coin credits", "/credits"],
    ["Inbox", "/inbox"],
    ["Edit profile", "/settings"],
    ["Terms of Service", "/terms"],
    ["Privacy Policy", "/privacy"],
  ];

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: insets.top + 16, padding: 16, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <Avatar username={viewer.username} name={viewer.display_name} src={viewer.avatar_url} size={64} />
        <View style={{ flex: 1, gap: 4 }}>
          <Display size={34} numberOfLines={1}>
            {viewer.display_name || <Handle username={viewer.username} size={34} />}
          </Display>
          <Body muted>
            <Handle username={viewer.username} />
          </Body>
          <StatusBadge roles={viewer.roles} />
        </View>
      </View>
      <PhotoCard />
      <CoverCard />
      <AboutCard />
      <StatusCard />
      <NotificationsCard />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Coin size={13} />
        <Mono muted={false}>{viewer.credits} V Coin</Mono>
      </View>
      <Button label="View your profile" onPress={() => router.push(`/u/${viewer.username}`)} />
      {/* Money is set up on the website (payouts go through Stripe there). */}
      {SITE_URL ? (
        <Card style={{ gap: 10 }}>
          <Body bold>Earnings and sponsorships</Body>
          <Body muted size={13}>
            Head to the website to set up payouts, price your sponsorship packages and manage your deals and tips.
          </Body>
          <Button label="Set up on the website ↗" onPress={() => web("/earn")} />
        </Card>
      ) : null}
      {SITE_URL ? (
        <Card style={{ gap: 4 }}>
          {links.map(([label, path]) => (
            <Button key={path} label={`${label} ↗`} kind="ghost" onPress={() => web(path)} style={{ borderWidth: 0, justifyContent: "flex-start" }} />
          ))}
        </Card>
      ) : null}
      <AccountCard />
      <PasswordCard />
      <Button label="Take the tour again" kind="ghost" onPress={tour.start} />
      <Button label="Sign out" kind="ghost" onPress={() => void signOut()} />
      <DeleteAccountCard username={viewer.username} />
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

// The wide header picture behind your photo, only on your profile page.
function CoverCard() {
  const t = useTheme();
  const cover = useLoad(getMyCover, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const current = cover.data;

  async function change(uri: string | null) {
    setBusy(true);
    setError(null);
    const r = await setCover(uri);
    if (r.ok) await cover.reload();
    else setError(r.error);
    setBusy(false);
  }

  async function pick() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 1], quality: 1 });
    if (result.canceled || !result.assets[0]) return;
    await change(result.assets[0].uri);
  }

  return (
    <Card style={{ gap: 10 }}>
      <Body bold>Header picture</Body>
      <Body muted size={13}>
        A wide picture behind your photo, only on your profile page.
      </Body>
      {current ? (
        <Image source={{ uri: current }} style={{ width: "100%", aspectRatio: 3, borderRadius: 10, backgroundColor: t.surface }} contentFit="cover" />
      ) : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button label={current ? "Change" : "Add a header picture"} busy={busy} onPress={() => void pick()} />
        {current ? <Button label="Remove" kind="ghost" disabled={busy} onPress={() => void change(null)} /> : null}
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
// Delete account: hidden behind a link, then type your username to confirm.
// Apple requires this in any app with sign-up. The website does the work
// (src/lib/delete-account.ts): it refuses while a sponsorship deal or payout
// is still in progress, so nobody loses money.
function DeleteAccountCard({ username }: { username: string }) {
  const t = useTheme();
  const { deleteAccount } = useAuth();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = confirmMatches(typed, username);

  if (!open) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setOpen(true)} style={{ alignSelf: "center", minHeight: 44, justifyContent: "center" }}>
        <Body size={14} style={{ color: t.danger }}>
          Delete account…
        </Body>
      </Pressable>
    );
  }

  return (
    <Card style={{ gap: 10, borderColor: t.danger }}>
      <Body bold>Delete account</Body>
      <Body size={14}>
        This can&apos;t be undone. It permanently deletes your profile, apps, Drops, comments, questions and messages, plus your V Coin, Pro,
        and any earnings not yet paid out.
      </Body>
      <Body muted size={13}>
        Type your username ({username}) to confirm.
      </Body>
      <TextInput
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={username}
        placeholderTextColor={t.muted}
        accessibilityLabel="Type your username to confirm"
        style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.bg, color: t.ink, borderRadius: 8, paddingHorizontal: 12, minHeight: 44, fontFamily: fonts.body, fontSize: 16 }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete my account"
        aria-disabled={!matches || busy}
        disabled={!matches || busy}
        onPress={async () => {
          setBusy(true);
          setError(null);
          const r = await deleteAccount(typed);
          setBusy(false);
          if (!r.ok) setError(r.error);
        }}
        style={{ backgroundColor: t.danger, opacity: !matches || busy ? 0.5 : 1, borderRadius: 10, minHeight: 48, alignItems: "center", justifyContent: "center" }}
      >
        <Body bold style={{ color: "#ffffff" }}>
          {busy ? "Deleting…" : "Delete my account"}
        </Body>
      </Pressable>
      <ErrorText>{error}</ErrorText>
      <Button label="Cancel" kind="ghost" onPress={() => (setOpen(false), setTyped(""), setError(null))} />
    </Card>
  );
}

// Your name, bio and skills, edited right here (the rest, like your website
// and socials, is on the website's Edit profile).
function AboutCard() {
  const t = useTheme();
  const { refresh } = useAuth();
  const saved = useLoad<About | null>(async () => {
    const r = await getMyAbout();
    return r.ok ? r.data : null;
  }, []);
  const [draft, setDraft] = useState<{ display_name: string; bio: string; skills: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const current = saved.data;
  if (!current) return null;
  const form = draft ?? { display_name: current.display_name, bio: current.bio, skills: current.skills.join(", ") };
  const set = (key: keyof typeof form) => (value: string) => (setMessage(null), setDraft({ ...form, [key]: value }));

  return (
    <Card style={{ gap: 10 }}>
      <Body bold>About you</Body>
      <Body muted size={13}>
        Shown on your profile.
      </Body>
      <Mono>Name</Mono>
      <TextInput
        value={form.display_name}
        onChangeText={set("display_name")}
        maxLength={60}
        placeholder="Your name"
        placeholderTextColor={t.muted}
        accessibilityLabel="Display name"
        style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.bg, color: t.ink, borderRadius: 8, paddingHorizontal: 12, minHeight: 44, fontFamily: fonts.body, fontSize: 16 }}
      />
      <Mono>Bio · up to 280 characters</Mono>
      <TextInput
        value={form.bio}
        onChangeText={set("bio")}
        maxLength={280}
        multiline
        placeholder="What do you build? What are you into?"
        placeholderTextColor={t.muted}
        accessibilityLabel="Bio"
        style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.bg, color: t.ink, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, minHeight: 88, textAlignVertical: "top", fontFamily: fonts.body, fontSize: 16 }}
      />
      <Mono>Skills · comma separated</Mono>
      <TextInput
        value={form.skills}
        onChangeText={set("skills")}
        autoCapitalize="none"
        placeholder="Next.js, Figma, Supabase"
        placeholderTextColor={t.muted}
        accessibilityLabel="Skills"
        style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.bg, color: t.ink, borderRadius: 8, paddingHorizontal: 12, minHeight: 44, fontFamily: fonts.body, fontSize: 16 }}
      />
      <Button
        label="Save"
        kind="ghost"
        busy={busy}
        disabled={!draft}
        onPress={async () => {
          setBusy(true);
          const r = await saveAbout(form);
          setBusy(false);
          if (!r.ok) return setMessage({ ok: false, text: r.error });
          setMessage({ ok: true, text: "Saved." });
          setDraft(null);
          saved.reload();
          void refresh();
        }}
      />
      {message ? <Body size={13} style={{ color: message.ok ? t.accent : t.danger }}>{message.text}</Body> : null}
    </Card>
  );
}

// Your private account details: only you see them.
function AccountCard() {
  const { session } = useAuth();
  if (!session) return null;
  const names: Record<string, string> = { email: "Email", google: "Google", apple: "Apple", github: "GitHub" };
  const providers = ((session.user.app_metadata?.providers as string[] | undefined) ?? [session.user.app_metadata?.provider ?? "email"])
    .map((p) => names[p] ?? p)
    .join(", ");
  return (
    <Card style={{ gap: 6 }}>
      <Body bold>Your account</Body>
      <Body muted size={13}>
        Private: only you can see this.
      </Body>
      <Mono>Email</Mono>
      <Body>{session.user.email}</Body>
      <Mono>Signs in with</Mono>
      <Body>{providers}</Body>
    </Card>
  );
}

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
