// Push notifications on this phone: turning them on (permission, then the
// phone's Expo push token is registered to your account), off, and which
// kinds you want. The website's server sends them (see /api/push/send).

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { DEMO_MESSAGE } from "./config";
import { fail, ok, type Result } from "./result";
import { supabase } from "./supabase";

const TOKEN_KEY = "method-v-push-token";

export type PushKinds = { follows: boolean; feedback: boolean; messages: boolean };

// Show pushes as a banner even while the app is open.
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
  });
}

export const pushSupported = Platform.OS === "ios" || Platform.OS === "android";

// On if this phone has a registered token and permission is still granted.
export async function pushIsOn(): Promise<boolean> {
  if (!pushSupported) return false;
  const [token, perm] = await Promise.all([AsyncStorage.getItem(TOKEN_KEY), Notifications.getPermissionsAsync()]);
  return Boolean(token) && perm.granted;
}

export async function turnOnPush(): Promise<Result> {
  if (!supabase) return fail(DEMO_MESSAGE);
  if (!pushSupported) return fail("Notifications work in the iPhone and Android app.");
  if (!Device.isDevice) return fail("Push notifications need a real phone, not a simulator.");
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", { name: "Method V", importance: Notifications.AndroidImportance.HIGH });
  }
  let perm = await Notifications.getPermissionsAsync();
  if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
  if (!perm.granted) return fail("Notifications are blocked for Method V. Turn them on in your phone's Settings, then try again.");
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return fail("This build isn't linked to an Expo project yet (run eas init), so it can't get notifications.");
  let token: string;
  try {
    token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return fail("Couldn't get a notification token from your phone. Check your connection and try again.");
  }
  const { error } = await supabase.rpc("register_push_token", { p_token: token, p_platform: Platform.OS });
  if (error) return fail("Couldn't turn on notifications.");
  await AsyncStorage.setItem(TOKEN_KEY, token);
  return ok(undefined);
}

// Also run when signing out, so the next person on this phone doesn't get
// your notifications.
export async function turnOffPush(): Promise<Result> {
  const token = await AsyncStorage.getItem(TOKEN_KEY);
  if (token && supabase) await supabase.rpc("unregister_push_token", { p_token: token });
  await AsyncStorage.removeItem(TOKEN_KEY);
  return ok(undefined);
}

export async function getPushKinds(userId: string): Promise<PushKinds> {
  const all = { follows: true, feedback: true, messages: true };
  if (!supabase) return all;
  const { data } = await supabase.from("notification_settings").select("follows, feedback, messages").eq("user_id", userId).maybeSingle();
  return { ...all, ...(data ?? {}) };
}

export async function savePushKinds(userId: string, kinds: PushKinds): Promise<Result> {
  if (!supabase) return fail(DEMO_MESSAGE);
  const { error } = await supabase.from("notification_settings").upsert({ user_id: userId, ...kinds }, { onConflict: "user_id" });
  return error ? fail("Couldn't save your notification settings.") : ok(undefined);
}
