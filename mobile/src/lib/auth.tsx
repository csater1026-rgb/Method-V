import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { DEMO_MESSAGE, MIN_PASSWORD, fileUrl } from "./config";
import { fail, friendly, ok, type Result } from "./result";
import { supabase } from "./supabase";

WebBrowser.maybeCompleteAuthSession();

export type Viewer = {
  id: string;
  username: string;
  display_name: string;
  credits: number;
  roles: string[];
  avatar_url: string | null;
};

// "cancelled" means the person closed the Google/Apple sheet: not an error to show.
type SignInResult = Result<"signed-in" | "check-email" | "cancelled">;

type Auth = {
  viewer: Viewer | null;
  session: Session | null;
  ready: boolean;
  signInWithPassword: (email: string, password: string) => Promise<SignInResult>;
  signUp: (email: string, password: string) => Promise<SignInResult>;
  signInWithGoogle: () => Promise<SignInResult>;
  signInWithApple: () => Promise<SignInResult>;
  sendCode: (email: string) => Promise<Result>;
  verifyCode: (email: string, code: string, kind: "email" | "signup") => Promise<Result>;
  setPassword: (password: string) => Promise<Result>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<Auth | null>(null);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (email: string) => email.trim().toLowerCase();

// Ways in: email + password, Google, Apple (iPhone), or a 6-digit code by
// email (which doubles as "forgot password"). The same account works on the
// website.
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [ready, setReady] = useState(!supabase);

  const loadViewer = useCallback(async (s: Session | null) => {
    if (!supabase || !s) return setViewer(null);
    let { data, error } = await supabase
      .from("profiles")
      .select("id, username, display_name, credits, roles, avatar_path")
      .eq("id", s.user.id)
      .maybeSingle();
    // A database without profile photos yet (migration 20261001000000):
    // stay signed in, with letter avatars.
    if (error) {
      ({ data, error } = await supabase.from("profiles").select("id, username, display_name, credits, roles").eq("id", s.user.id).maybeSingle());
    }
    setViewer(
      data
        ? {
            id: data.id,
            username: data.username,
            display_name: data.display_name ?? "",
            credits: data.credits ?? 0,
            roles: data.roles ?? [],
            avatar_url: fileUrl(data.avatar_path),
          }
        : null,
    );
  }, []);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadViewer(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      void loadViewer(s);
    });
    return () => data.subscription.unsubscribe();
  }, [loadViewer]);

  const value = useMemo<Auth>(
    () => ({
      viewer,
      session,
      ready,

      async signInWithPassword(email, password) {
        if (!supabase) return fail(DEMO_MESSAGE);
        if (!EMAIL.test(cleanEmail(email))) return fail("Enter a valid email address.");
        if (!password) return fail("Enter your password.");
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail(email), password });
        if (!error) return ok("signed-in");
        if (/confirm/i.test(error.message)) return fail("Confirm your email first: check your inbox for the code or link.");
        return fail("That email and password don't match. Try again, or sign in with an emailed code.");
      },

      async signUp(email, password) {
        if (!supabase) return fail(DEMO_MESSAGE);
        if (!EMAIL.test(cleanEmail(email))) return fail("Enter a valid email address.");
        if (password.length < MIN_PASSWORD) return fail(`Use at least ${MIN_PASSWORD} characters for your password.`);
        const { data, error } = await supabase.auth.signUp({ email: cleanEmail(email), password });
        if (error) return fail(friendly(error.message, "Couldn't create your account. Try again."));
        // With email confirmation on (the Supabase default) there's no session yet.
        return ok(data.session ? "signed-in" : "check-email");
      },

      async signInWithGoogle() {
        if (!supabase) return fail(DEMO_MESSAGE);
        const redirectTo = makeRedirectUri({ scheme: "methodv", path: "auth/callback" });
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo, skipBrowserRedirect: true },
        });
        if (error || !data.url) return fail("Google sign-in isn't available right now.");
        const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (res.type !== "success") return ok("cancelled");
        const params = new URL(res.url).searchParams;
        const code = params.get("code");
        if (!code) return fail(params.get("error_description") ?? "Google sign-in didn't finish. Try again.");
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        return exchangeError ? fail("Google sign-in didn't finish. Try again.") : ok("signed-in");
      },

      async signInWithApple() {
        if (!supabase) return fail(DEMO_MESSAGE);
        // Apple signs a hash of a one-time value; Supabase checks it against the original.
        const nonce = Crypto.randomUUID();
        const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
        try {
          const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
            nonce: hashed,
          });
          if (!credential.identityToken) return fail("Apple sign-in didn't finish. Try again.");
          const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: credential.identityToken, nonce });
          if (error) return fail("Apple sign-in didn't finish. Try again.");
          // Apple only shares the name the first time; keep it as the display name.
          const name = [credential.fullName?.givenName, credential.fullName?.familyName].filter(Boolean).join(" ");
          if (name) await supabase.auth.updateUser({ data: { display_name: name } });
          return ok("signed-in");
        } catch (e) {
          if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return ok("cancelled");
          return fail("Apple sign-in didn't finish. Try again.");
        }
      },

      async sendCode(email) {
        if (!supabase) return fail(DEMO_MESSAGE);
        if (!EMAIL.test(cleanEmail(email))) return fail("Enter a valid email address.");
        const { error } = await supabase.auth.signInWithOtp({ email: cleanEmail(email), options: { shouldCreateUser: true } });
        return error ? fail(friendly(error.message, "Couldn't send the code. Try again.")) : ok(undefined);
      },

      async verifyCode(email, code, kind) {
        if (!supabase) return fail(DEMO_MESSAGE);
        const token = code.replace(/\s/g, "");
        if (!/^\d{6,10}$/.test(token)) return fail("Enter the code from the email.");
        const { error } = await supabase.auth.verifyOtp({ email: cleanEmail(email), token, type: kind });
        return error ? fail("That code didn't work or has expired. Ask for a new one.") : ok(undefined);
      },

      async setPassword(password) {
        if (!supabase) return fail(DEMO_MESSAGE);
        if (password.length < MIN_PASSWORD) return fail(`Use at least ${MIN_PASSWORD} characters.`);
        const { error } = await supabase.auth.updateUser({ password });
        return error ? fail(friendly(error.message, "Couldn't save your password.")) : ok(undefined);
      },

      async signOut() {
        await supabase?.auth.signOut();
      },

      async refresh() {
        await loadViewer(session);
      },
    }),
    [viewer, session, ready, loadViewer],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth needs <AuthProvider>");
  return ctx;
}
