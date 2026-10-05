import type { Session } from "@supabase/supabase-js";
import * as AppleAuthentication from "expo-apple-authentication";
import { makeRedirectUri } from "expo-auth-session";
import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { LEGAL } from "@shared/constants";

import { DEMO_MESSAGE, MIN_PASSWORD, SITE_URL, fileUrl } from "./config";
import { turnOffPush } from "./push";
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
  resendCode: (email: string, kind: "email" | "signup") => Promise<Result>;
  setPassword: (password: string) => Promise<Result>;
  agreeToTerms: () => Promise<Result>;
  deleteAccount: (confirm: string) => Promise<Result>;
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
    const [{ data, error }, balance] = await Promise.all([
      supabase.from("profiles").select("id, username, display_name, roles, avatar_path").eq("id", s.user.id).maybeSingle(),
      // Methodium balances are private: my_credits() reads only your own.
      supabase.rpc("my_credits"),
    ]);
    const credits = Number(balance.data ?? 0);
    if (balance.error) console.warn("Couldn't load your Methodium", balance.error.message);
    if (error) console.warn("Couldn't load your profile", error.message);
    setViewer(
      data
        ? {
            id: data.id,
            username: data.username,
            display_name: data.display_name ?? "",
            credits,
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
        // Never confirmed: to the code screen, where they can ask for a new one.
        if (/confirm/i.test(error.message)) return ok("check-email");
        return fail("That email and password don't match. Try again, or sign in with an emailed code.");
      },

      async signUp(email, password) {
        if (!supabase) return fail(DEMO_MESSAGE);
        if (!EMAIL.test(cleanEmail(email))) return fail("Enter a valid email address.");
        if (password.length < MIN_PASSWORD) return fail(`Use at least ${MIN_PASSWORD} characters for your password.`);
        // The screen only allows this once they've ticked the Terms box; record
        // which version (its "Last updated" date) they agreed to.
        const { data, error } = await supabase.auth.signUp({ email: cleanEmail(email), password, options: { data: { agreed_to_terms: LEGAL.updated } } });
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

      // "Send a new code": the sign-up confirmation again, or a new sign-in code.
      async resendCode(email, kind) {
        if (!supabase) return fail(DEMO_MESSAGE);
        const { error } =
          kind === "signup"
            ? await supabase.auth.resend({ type: "signup", email: cleanEmail(email) })
            : await supabase.auth.signInWithOtp({ email: cleanEmail(email), options: { shouldCreateUser: true } });
        if (!error) return ok(undefined);
        if (/rate limit|too many|seconds/i.test(error.message)) return fail("Too many emails asked for. Wait a minute, then try again.");
        return fail(friendly(error.message, "Couldn't send a new code. Try again in a minute."));
      },

      async setPassword(password) {
        if (!supabase) return fail(DEMO_MESSAGE);
        if (password.length < MIN_PASSWORD) return fail(`Use at least ${MIN_PASSWORD} characters.`);
        const { error } = await supabase.auth.updateUser({ password });
        return error ? fail(friendly(error.message, "Couldn't save your password.")) : ok(undefined);
      },

      // The one-time "agree to continue" screen (Google/Apple sign-ups, and
      // accounts from before the sign-up box). The new session carries it.
      async agreeToTerms() {
        if (!supabase) return fail(DEMO_MESSAGE);
        const { error } = await supabase.auth.updateUser({ data: { agreed_to_terms: LEGAL.updated } });
        if (error) return fail(friendly(error.message, "Couldn't save that. Try again."));
        await supabase.auth.refreshSession();
        return ok(undefined);
      },

      // Delete account (Me tab). The website does it (it needs Method V's
      // secret key); you confirm by typing your username. Then this phone
      // forgets the session.
      async deleteAccount(confirm) {
        if (!supabase || !session) return fail(DEMO_MESSAGE);
        if (!SITE_URL) return fail("The app is missing EXPO_PUBLIC_SITE_URL, so it can't reach the website.");
        try {
          const res = await fetch(`${SITE_URL}/api/mobile/delete-account`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ confirm }),
          });
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          if (!res.ok) return fail(json.error ?? "Couldn't delete your account. Try again.");
        } catch {
          return fail("Couldn't reach Method V. Check your connection.");
        }
        await supabase.auth.signOut({ scope: "local" }).catch(() => {});
        return ok(undefined);
      },

      async signOut() {
        // Forget this phone first, so the next person on it doesn't get your notifications.
        await turnOffPush().catch(() => {});
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
