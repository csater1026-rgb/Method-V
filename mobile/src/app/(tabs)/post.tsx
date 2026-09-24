import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CATEGORIES, DROP_VIDEO_TYPES, MAX_DROP_BYTES, MAX_DROP_SECONDS } from "@shared/constants";

import { PixelCoder } from "@/components/PixelCoder";
import { Body, Button, Card, Display, ErrorText, Mono, tap } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { isLive } from "@/lib/config";
import { postDrop, previewLink } from "@/lib/data";
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
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);

  if (isLive && !viewer) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 16, backgroundColor: t.bg }}>
        <PixelCoder size={140} />
        <Display size={40} style={{ textAlign: "center" }}>
          Post a Drop
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
    if (a.fileSize && a.fileSize > MAX_DROP_BYTES) return setError("That video is over 100 MB. Try a shorter or smaller one.");
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

  const missing = [!video && "a video", !url.trim() && "your link", !name.trim() && "a name", !tagline.trim() && "a tagline", !category && "a category"].filter(Boolean);

  async function post() {
    if (!video || missing.length) return;
    setError(null);
    setProgress(0);
    const r = await postDrop(
      { videoUri: video.uri, mimeType: video.mimeType, durationSeconds: video.seconds, url: url.trim(), name, tagline, category, caption },
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
    setTouched({});
    router.push(`/apps/${r.data.slug}`);
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 12, padding: 16, gap: 18, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Display size={52}>Post a Drop</Display>
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

        {missing.length > 0 && <Body muted size={13}>Still need: {missing.join(", ")}.</Body>}
        <ErrorText>{error}</ErrorText>
        <Button label="Post" onPress={() => void post()} disabled={missing.length > 0} busy={progress !== null} />
      </ScrollView>

      {progress !== null && (
        <View accessibilityRole="progressbar" accessibilityLabel="Posting" style={{ position: "absolute", inset: 0, backgroundColor: t.bg, alignItems: "center", justifyContent: "center", gap: 16 }}>
          <PixelCoder size={160} />
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
