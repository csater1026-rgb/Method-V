import * as AppleAuthentication from "expo-apple-authentication";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";

import { PixelCoder } from "@/components/PixelCoder";
import { Body, Button, Display, ErrorText, Mono } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { AUTH_PROVIDERS, DEMO_MESSAGE, MIN_PASSWORD, isLive } from "@/lib/config";
import { fonts, useColorSchemeName, useTheme } from "@/theme";

type Mode = "signin" | "signup" | "code";

// One screen for every way in: Apple and Google on top, then email and
// password (sign in or create an account), and an emailed code for anyone
// who forgot their password.
export default function SignInScreen() {
  const t = useTheme();
  const scheme = useColorSchemeName();
  const router = useRouter();
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  // After "Email me a code" or creating an account: waiting for the code.
  const [awaiting, setAwaiting] = useState<null | "email" | "signup">(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [appleReady, setAppleReady] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios" && AUTH_PROVIDERS.includes("apple")) void AppleAuthentication.isAvailableAsync().then(setAppleReady);
  }, []);

  // Signed in from the first screen: Home only opens up once the session is
  // set (the rest of the app is protected until then), so go there now.
  useEffect(() => {
    if (isLive && auth.session && !router.canGoBack()) router.replace("/");
  }, [auth.session, router]);

  const input = { borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, color: t.ink, borderRadius: 8, paddingHorizontal: 12, minHeight: 48, fontFamily: fonts.body, fontSize: 17 } as const;

  async function run(key: string, action: () => Promise<{ ok: boolean; error?: string; data?: unknown }>) {
    setBusy(key);
    setError(null);
    const r = await action();
    setBusy(null);
    if (!r.ok) return setError(r.error ?? "Something went wrong.");
    if (r.data === "check-email") return setAwaiting("signup");
    if (r.data === "cancelled") return;
    if (r.data === "sent") return setAwaiting("email");
    // Opened as a sheet: close it. Opened as the first screen (signed out),
    // the effect below opens Home once the new session is in place.
    if (router.canGoBack()) router.back();
  }

  if (awaiting) {
    return (
      <Wrap t={t}>
        <Display size={40}>Check your email</Display>
        <Body>
          We sent a code to <Body bold>{email.trim()}</Body>.{" "}
          {awaiting === "signup" ? "Type it here to confirm your account." : "Type it here to sign in."}
        </Body>
        <TextInput
          value={code}
          onChangeText={setCode}
          placeholder="123456"
          placeholderTextColor={t.muted}
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          accessibilityLabel="Code"
          maxLength={10}
          style={[input, { fontFamily: fonts.mono, letterSpacing: 6 }]}
        />
        <Button label="Continue" onPress={() => void run("code", () => auth.verifyCode(email, code, awaiting))} busy={busy === "code"} disabled={code.trim().length < 6} />
        <Button label="Back" kind="ghost" onPress={() => (setAwaiting(null), setCode(""), setError(null))} />
        <ErrorText>{error}</ErrorText>
      </Wrap>
    );
  }

  const primary =
    mode === "signin"
      ? { label: "Sign in", action: () => auth.signInWithPassword(email, password) }
      : mode === "signup"
        ? { label: "Create account", action: () => auth.signUp(email, password) }
        : { label: "Email me a code", action: async () => { const r = await auth.sendCode(email); return r.ok ? { ok: true, data: "sent" } : r; } };

  return (
    <Wrap t={t}>
      <PixelCoder size={88} />
      <Display size={42}>{mode === "signup" ? "Join Method V" : "Log in or create an account"}</Display>
      {isLive ? (
        <Body muted>Method V is for members. Sign in to see the apps, or join free in a minute.</Body>
      ) : (
        <Body muted>{DEMO_MESSAGE}</Body>
      )}

      {(appleReady || AUTH_PROVIDERS.includes("google")) && (
        <View style={{ gap: 10 }}>
          {appleReady && (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={mode === "signup" ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP : AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
              buttonStyle={scheme === "light" ? AppleAuthentication.AppleAuthenticationButtonStyle.BLACK : AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
              cornerRadius={8}
              style={{ height: 48 }}
              onPress={() => void run("apple", auth.signInWithApple)}
            />
          )}
          {AUTH_PROVIDERS.includes("google") && (
            <Button label="Continue with Google" kind="ghost" busy={busy === "google"} onPress={() => void run("google", auth.signInWithGoogle)} />
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 4 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
            <Mono>or with email</Mono>
            <View style={{ flex: 1, height: 1, backgroundColor: t.line }} />
          </View>
        </View>
      )}

      {mode !== "code" && (
        <View accessibilityRole="tablist" style={{ flexDirection: "row", borderWidth: 1, borderColor: t.line, borderRadius: 8, padding: 3 }}>
          {(["signin", "signup"] as const).map((m) => (
            <Pressable
              key={m}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === m }}
              onPress={() => (setMode(m), setError(null))}
              style={{ flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 6, backgroundColor: mode === m ? t.accent : "transparent" }}
            >
              <Body bold size={14} style={{ color: mode === m ? t.accentInk : t.muted }}>
                {m === "signin" ? "Sign in" : "Create account"}
              </Body>
            </Pressable>
          ))}
        </View>
      )}

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={t.muted}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        accessibilityLabel="Email"
        style={input}
      />
      {mode !== "code" && (
        <View>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder={mode === "signup" ? `Password (${MIN_PASSWORD}+ characters)` : "Password"}
            placeholderTextColor={t.muted}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            textContentType={mode === "signup" ? "newPassword" : "password"}
            accessibilityLabel="Password"
            onSubmitEditing={() => void run("primary", primary.action)}
            style={[input, { paddingRight: 70 }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={showPassword ? "Hide password" : "Show password"}
            onPress={() => setShowPassword((s) => !s)}
            style={{ position: "absolute", right: 4, top: 0, bottom: 0, justifyContent: "center", paddingHorizontal: 10 }}
          >
            <Mono>{showPassword ? "Hide" : "Show"}</Mono>
          </Pressable>
        </View>
      )}

      <Button
        label={primary.label}
        onPress={() => void run("primary", primary.action)}
        busy={busy === "primary"}
        disabled={!email.trim() || (mode !== "code" && !password)}
      />
      <ErrorText>{error}</ErrorText>

      <Pressable
        accessibilityRole="button"
        onPress={() => (setMode(mode === "code" ? "signin" : "code"), setError(null))}
        style={{ minHeight: 40, justifyContent: "center", alignSelf: "center" }}
      >
        <Body bold size={14} style={{ color: t.accent }}>
          {mode === "code" ? "Use a password instead" : "Forgot your password? Email me a code"}
        </Body>
      </Pressable>
    </Wrap>
  );
}

function Wrap({ t, children }: { t: ReturnType<typeof useTheme>; children: React.ReactNode }) {
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 14 }} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
