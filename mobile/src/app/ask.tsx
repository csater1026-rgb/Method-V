import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";

import { Loading } from "@/components/PixelCoder";
import { Body, Button, Card, Display, ErrorText, Mono, tap } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { DEMO_MESSAGE, isLive } from "@/lib/config";
import { askQuestion, getMyApps } from "@/lib/data";
import { useLoad } from "@/lib/useLoad";
import { fonts, useTheme } from "@/theme";

// Ask people about an app: the one you came from, or one of yours. Add 2-4
// poll choices and people answer with one tap. It shows up in Questions.
export default function AskScreen() {
  const t = useTheme();
  const router = useRouter();
  const { viewer } = useAuth();
  const params = useLocalSearchParams<{ app?: string; name?: string }>();
  const mine = useLoad(() => (params.app ? Promise.resolve([]) : getMyApps(viewer?.id ?? null)), [viewer?.id, params.app]);
  const [picked, setPicked] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [options, setOptions] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = {
    borderWidth: 1,
    borderColor: t.line,
    backgroundColor: t.bg,
    color: t.ink,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: fonts.body,
    fontSize: 16,
  } as const;

  if (!viewer && isLive) {
    return (
      <View style={{ flex: 1, padding: 24, gap: 14, backgroundColor: t.bg }}>
        <Stack.Screen options={{ title: "Ask a question" }} />
        <Display size={36}>Ask a question</Display>
        <Body muted>Sign in to ask people about your app.</Body>
        <Button label="Sign in" onPress={() => router.push("/sign-in")} />
      </View>
    );
  }
  if (!params.app && !mine.data && !mine.error) return <Loading />;

  const apps = params.app ? [{ id: params.app, name: params.name ?? "this app" }] : (mine.data ?? []);
  const appId = picked ?? apps[0]?.id ?? null;
  const pollOk = !options || options.filter((o) => o.trim()).length >= 2;

  async function send() {
    if (!appId) return;
    setBusy(true);
    setError(null);
    const r = await askQuestion(appId, body, options);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.replace(`/q/${r.data}`);
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: t.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: "Ask a question" }} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Display size={40}>Ask a question</Display>
        <Body muted>What to build next, which design is better, what&apos;s confusing. Add a poll and people answer with one tap.</Body>
        {!isLive && <Body muted size={13}>{DEMO_MESSAGE}</Body>}

        {apps.length === 0 ? (
          <Card style={{ gap: 10 }}>
            <Body>Questions live on an app. Post yours first, or open any app and ask from its page.</Body>
            <Button label="Post a Drop" onPress={() => router.replace("/post")} />
          </Card>
        ) : (
          <>
            <View style={{ gap: 6 }}>
              <Mono>About</Mono>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {apps.map((a) => {
                  const on = a.id === appId;
                  return (
                    <Pressable
                      key={a.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        tap();
                        setPicked(a.id);
                      }}
                      style={{ borderWidth: 1, borderColor: on ? t.accent : t.line, backgroundColor: on ? t.accent : "transparent", borderRadius: 8, paddingHorizontal: 12, minHeight: 38, justifyContent: "center" }}
                    >
                      <Body bold={on} size={14} style={{ color: on ? t.accentInk : t.ink }}>
                        {a.name}
                      </Body>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <TextInput
              value={body}
              onChangeText={setBody}
              placeholder="Your question"
              placeholderTextColor={t.muted}
              multiline
              maxLength={500}
              accessibilityLabel="Your question"
              style={{ ...field, minHeight: 90, textAlignVertical: "top" }}
            />

            {options ? (
              <Card style={{ gap: 8 }}>
                <Body bold>Poll choices</Body>
                <Body muted size={13}>
                  People answer with one tap. 2 to 4 choices.
                </Body>
                {options.map((o, i) => (
                  <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                    <TextInput
                      value={o}
                      onChangeText={(v) => setOptions(options.map((x, j) => (j === i ? v : x)))}
                      placeholder={`Choice ${i + 1}`}
                      placeholderTextColor={t.muted}
                      maxLength={60}
                      accessibilityLabel={`Choice ${i + 1}`}
                      style={{ ...field, flex: 1, minHeight: 44 }}
                    />
                    {options.length > 2 && (
                      <Pressable onPress={() => setOptions(options.filter((_, j) => j !== i))} hitSlop={8} accessibilityLabel={`Remove choice ${i + 1}`}>
                        <Mono>Remove</Mono>
                      </Pressable>
                    )}
                  </View>
                ))}
                <View style={{ flexDirection: "row", gap: 16 }}>
                  {options.length < 4 && (
                    <Pressable onPress={() => setOptions([...options, ""])} hitSlop={8}>
                      <Body bold size={14} style={{ color: t.accent }}>
                        + Add a choice
                      </Body>
                    </Pressable>
                  )}
                  <Pressable onPress={() => setOptions(null)} hitSlop={8}>
                    <Body muted size={14}>
                      No poll
                    </Body>
                  </Pressable>
                </View>
              </Card>
            ) : (
              <Pressable onPress={() => setOptions(["", ""])} hitSlop={8} style={{ alignSelf: "flex-start" }}>
                <Body bold size={14} style={{ color: t.accent }}>
                  + Add a poll
                </Body>
              </Pressable>
            )}

            <Button label="Ask" busy={busy} disabled={body.trim().length < 5 || !pollOk || !appId} onPress={() => void send()} />
            <ErrorText>{error}</ErrorText>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
