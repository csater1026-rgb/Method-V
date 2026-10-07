import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useCallback, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CATEGORIES, DROP_VIDEO_TYPES, MAX_DROP_BYTES, MAX_DROP_MB, MAX_DROP_SECONDS, SAFETY_AGREEMENT, SAFETY_CHECKLIST, V_STORE } from "@shared/constants";
import { APP_LIMIT, limitMessage } from "@shared/app-limit";

import { AppLogo } from "@/components/AppCard";
import { Body, Button, Card, Display, ErrorText, Mono, tap } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { isLive } from "@/lib/config";
import { getMyAppLimit, getPromotion, postDrop, previewLink } from "@/lib/data";
import { useLoad } from "@/lib/useLoad";
import { fonts, media, useTheme, type Palette } from "@/theme";

type Video = { uri: string; mimeType: string; seconds: number };

// Posting in two steps, like the website: your video, then your link.
export default function PostScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { viewer } = useAuth();
  const [video, setVideo] = useState<Video | null>(null);
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [category, setCategory] = useState("");
  const [caption, setCaption] = useState("");
  const [safe, setSafe] = useState(false);
  // Optional cover image for the app's card (else the Drop's frame).
  const [cover, setCover] = useState<string | null>(null);
  // Optional square logo (else the app's first letter on its own colors).
  const [logo, setLogo] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  // 3 new apps every 30 days (5 with extra posts): checked up front so nobody
  // uploads a video for nothing, and again each time the tab is opened (an
  // extra post may have been bought on the website since).
  const limit = useLoad(() => getMyAppLimit(viewer?.id ?? null), [viewer?.id]);
  const full = limit.data?.nextAt ?? null;
  const capped = limit.data?.capped ?? false;
  const { reload: reloadLimit, setData: setLimit } = limit;
  useFocusEffect(
    useCallback(() => {
      void reloadLimit();
    }, [reloadLimit]),
  );

  if (isLive && !viewer) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16, backgroundColor: t.bg }}>
        <Display size={40} style={{ textAlign: "center" }}>
          Post your project
        </Display>
        <Body muted style={{ textAlign: "center" }}>
          Show off what you built in 60 seconds or less. Sign in to post.
        </Body>
        <Button label="Sign in" onPress={() => router.push("/sign-in")} />
      </View>
    );
  }

  async function pick(camera: boolean) {
    setError(null);
    if (camera) {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return setError("Camera access is off. Turn it on in Settings to record a Drop.");
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["videos"], videoMaxDuration: MAX_DROP_SECONDS, quality: 1 };
    const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets[0]) return;
    const a = result.assets[0];
    const seconds = (a.duration ?? 0) / 1000;
    const mimeType = a.mimeType ?? "video/mp4";
    if (!seconds || seconds > MAX_DROP_SECONDS + 0.5) return setError(`Drops can be up to ${MAX_DROP_SECONDS} seconds. Trim it and try again.`);
    if (!DROP_VIDEO_TYPES.includes(mimeType)) return setError("Use an MP4, MOV or WebM video.");
    if (a.fileSize && a.fileSize > MAX_DROP_BYTES) return setError(`That video is over ${MAX_DROP_MB} MB. Trim it, or record at 1080p instead of 4K.`);
    tap();
    setVideo({ uri: a.uri, mimeType, seconds: Math.min(seconds, MAX_DROP_SECONDS) });
  }

  async function readSite() {
    if (!/^https?:\/\/\S+\.\S+/.test(url.trim())) return;
    setReading(true);
    const r = await previewLink(url.trim());
    setReading(false);
    if (!r.ok) return;
    // Never overwrite something the person typed.
    if (!touched.name && r.data.name) setName(r.data.name);
    if (!touched.tagline && r.data.tagline) setTagline(r.data.tagline);
    if (!touched.category && r.data.category) setCategory(r.data.category);
  }

  const missing = [
    !video && "a video",
    !url.trim() && "your link",
    !name.trim() && "a name",
    !tagline.trim() && "a tagline",
    !category && "a category",
    !safe && "the safety check",
  ].filter(Boolean);

  async function post() {
    if (!video || missing.length) return;
    setError(null);
    // Check the limit again right before the upload (it may have changed).
    const fresh = await getMyAppLimit(viewer?.id ?? null).catch(() => null);
    if (fresh) setLimit(fresh);
    if (fresh?.nextAt) return setError(limitMessage(fresh.nextAt, fresh.capped));
    setProgress(0);
    const r = await postDrop(
      { videoUri: video.uri, mimeType: video.mimeType, durationSeconds: video.seconds, url: url.trim(), name, tagline, category, caption, safetyChecked: safe, coverUri: cover, logoUri: logo },
      setProgress,
    );
    setProgress(null);
    if (!r.ok) return setError(r.error);
    setVideo(null);
    setUrl("");
    setName("");
    setTagline("");
    setCategory("");
    setCaption("");
    setSafe(false);
    setCover(null);
    setLogo(null);
    setTouched({});
    void reloadLimit();
    router.push(`/apps/${r.data.slug}`);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, padding: 16, gap: 18, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Display size={52}>Post your project</Display>
        <DropBonus />
        {full ? (
          <Card style={{ gap: 6, borderColor: t.accent }}>
            <Body bold>You&apos;ve posted {capped ? APP_LIMIT.withExtras : APP_LIMIT.perWindow} apps this month</Body>
            <Body muted size={13}>
              {limitMessage(full, capped)}
            </Body>
            {!capped && <Button label={`Get an extra post · ${V_STORE.appPost.cost} Methodium`} kind="ghost" onPress={() => router.push("/store")} />}
          </Card>
        ) : null}
        <Pressable accessibilityRole="link" onPress={() => router.push("/ask")} hitSlop={8} style={{ marginTop: -10, alignSelf: "flex-start" }}>
          <Body bold size={14} style={{ color: t.accent }}>
            Or ask a question about your app →
          </Body>
        </Pressable>

        <View style={{ gap: 10 }}>
          <Mono style={{ textTransform: "uppercase" }}>1 · Your video (up to {MAX_DROP_SECONDS}s)</Mono>
          {video ? (
            <Card style={{ padding: 0, overflow: "hidden" }}>
              <Preview uri={video.uri} />
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12 }}>
                <Mono>{Math.round(video.seconds)}s · ready</Mono>
                <Pressable accessibilityRole="button" onPress={() => setVideo(null)} style={{ minHeight: 40, justifyContent: "center" }}>
                  <Body bold style={{ color: t.accent }}>
                    Change
                  </Body>
                </Pressable>
              </View>
            </Card>
          ) : (
            <View style={{ flexDirection: "row", gap: 10 }}>
              <Button label="Record" onPress={() => void pick(true)} style={{ flex: 1 }} />
              <Button label="Choose video" kind="ghost" onPress={() => void pick(false)} style={{ flex: 1 }} />
            </View>
          )}
        </View>

        <View style={{ gap: 10 }}>
          <Mono style={{ textTransform: "uppercase" }}>2 · Your app</Mono>
          <Field
            t={t}
            label="Link"
            value={url}
            onChangeText={setUrl}
            onBlur={() => void readSite()}
            placeholder="https://yourapp.com"
            keyboardType="url"
            autoCapitalize="none"
            hint={reading ? "Reading your site…" : "We'll fill in the rest from your site."}
          />
          <Field t={t} label="Name" value={name} maxLength={60} onChangeText={(v) => (setName(v), setTouched((x) => ({ ...x, name: true })))} />
          <Field
            t={t}
            label="Tagline"
            value={tagline}
            maxLength={120}
            onChangeText={(v) => (setTagline(v), setTouched((x) => ({ ...x, tagline: true })))}
            placeholder="What it does, in one line"
          />
          <Body bold size={14}>
            Category
          </Body>
          <View accessibilityRole="radiogroup" style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {CATEGORIES.map((c) => {
              const on = category === c.slug;
              return (
                <Pressable
                  key={c.slug}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => (setCategory(c.slug), setTouched((x) => ({ ...x, category: true })))}
                  style={{ borderWidth: 1, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accent : "transparent", borderRadius: 6, paddingHorizontal: 12, minHeight: 40, justifyContent: "center" }}
                >
                  <Body size={13} bold={on} style={{ color: on ? t.accentInk : t.ink }}>
                    {c.label}
                  </Body>
                </Pressable>
              );
            })}
          </View>
          <Field t={t} label="Caption (optional)" value={caption} maxLength={300} onChangeText={setCaption} multiline />
        </View>

        {/* The app's logo, next to its name on cards. Optional: without one, its first letter on its own colors. */}
        <View style={{ gap: 8 }}>
          <Body bold size={14}>
            Logo <Body muted size={13}>· Optional. Shows next to your app&apos;s name on Home and Browse.</Body>
          </Body>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <AppLogo name={name.trim() || "?"} src={logo} size={56} />
            <Button
              label={logo ? "Change" : "Add a logo"}
              kind="ghost"
              onPress={async () => {
                const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 1 });
                if (!r.canceled && r.assets[0]) setLogo(r.assets[0].uri);
              }}
            />
            {logo ? <Button label="Remove" kind="ghost" onPress={() => setLogo(null)} /> : null}
          </View>
        </View>

        {/* The picture on the app's card. Optional: without one, cards use the Drop's frame. */}
        <View style={{ gap: 8 }}>
          <Body bold size={14}>
            Cover image <Body muted size={13}>· Optional. Shows on Browse and Featured.</Body>
          </Body>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={{ width: 128, aspectRatio: 16 / 9, borderRadius: 8, overflow: "hidden", borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, alignItems: "center", justifyContent: "center" }}>
              {cover ? <Image source={{ uri: cover }} style={{ width: "100%", height: "100%" }} contentFit="cover" /> : <Mono>16:9</Mono>}
            </View>
            <Button
              label={cover ? "Change" : "Add a cover"}
              kind="ghost"
              onPress={async () => {
                const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [16, 9], quality: 1 });
                if (!r.canceled && r.assets[0]) setCover(r.assets[0].uri);
              }}
            />
            {cover ? <Button label="Remove" kind="ghost" onPress={() => setCover(null)} /> : null}
          </View>
        </View>

        {/* Before posting: the app is the builder's, and so is its security. */}
        <Card style={{ gap: 10 }}>
          <Body bold>Quick safety check</Body>
          <Body muted size={13}>
            People will try your app from here, so make sure it keeps them safe. The basics most vibe-coded apps miss:
          </Body>
          {/^http:\/\//i.test(url.trim()) ? (
            <Body size={13} style={{ color: t.danger }}>
              Your link starts with http://, not https://. Browsers will warn testers that it isn&apos;t secure.
            </Body>
          ) : null}
          {SAFETY_CHECKLIST.map((item) => (
            <Body key={item.title} size={13}>
              <Body bold size={13}>
                {item.title}.
              </Body>{" "}
              <Body muted size={13}>
                {item.body}
              </Body>
            </Body>
          ))}
          <Pressable
            accessibilityRole="checkbox"
            aria-checked={safe}
            accessibilityLabel={SAFETY_AGREEMENT}
            onPress={() => setSafe((s) => !s)}
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4 }}
          >
            <View
              style={{
                width: 22,
                height: 22,
                borderRadius: 5,
                borderWidth: 2,
                borderColor: safe ? t.accent : t.line,
                backgroundColor: safe ? t.accent : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {safe ? (
                <Body bold size={14} style={{ color: t.accentInk, lineHeight: 16 }}>
                  ✓
                </Body>
              ) : null}
            </View>
            <Body size={14} style={{ flex: 1 }}>
              {SAFETY_AGREEMENT}
            </Body>
          </Pressable>
        </Card>

        {missing.length > 0 && <Body muted size={13}>Still need: {missing.join(", ")}.</Body>}
        <ErrorText>{error}</ErrorText>
        <Button label="Post" onPress={() => void post()} disabled={missing.length > 0 || Boolean(full)} busy={progress !== null} />
      </ScrollView>

      {progress !== null && (
        <View accessibilityRole="progressbar" accessibilityLabel="Posting" style={{ position: "absolute", inset: 0, backgroundColor: t.bg, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <ActivityIndicator size="large" color={t.accent} />
          <Display size={32}>{progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : "Checking your link…"}</Display>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function Preview({ uri }: { uri: string }) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });
  return <VideoView player={player} style={{ aspectRatio: 9 / 16, maxHeight: 360, backgroundColor: media.bg }} contentFit="contain" nativeControls />;
}

function Field({ t, label, hint, ...props }: React.ComponentProps<typeof TextInput> & { t: Palette; label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Body bold size={14}>
        {label}
      </Body>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.muted}
        {...props}
        style={{ borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, color: t.ink, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, fontFamily: fonts.body, fontSize: 16 }}
      />
      {hint && (
        <Body muted size={12}>
          {hint}
        </Body>
      )}
    </View>
  );
}

// "Post a Drop, get +10 Methodium" while the promotion runs (same as the website).
function DropBonus() {
  const t = useTheme();
  const { data: promo } = useLoad(() => getPromotion("drop_bonus"), []);
  if (!promo) return null;
  const ends = new Date(promo.ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/Los_Angeles" });
  return (
    <Card style={{ gap: 4, borderColor: t.accent }}>
      <Body bold>🎉 Post a Drop, get +{promo.amount} Methodium</Body>
      <Body muted size={13}>
        Until {ends}: one bonus per app, up to {promo.per_day} a day. Spend it in the V Store, like a Spotlight spot on Home.
      </Body>
    </Card>
  );
}
