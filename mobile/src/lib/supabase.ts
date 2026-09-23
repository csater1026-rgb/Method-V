import "react-native-url-polyfill/auto";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AppState, Platform } from "react-native";

import { SUPABASE_KEY, SUPABASE_URL, isLive } from "./config";

// One client for the whole app, signed in as the person using it, so the
// database's row level security applies exactly as on the website.
export const supabase: SupabaseClient | null = isLive
  ? createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: {
        storage: Platform.OS === "web" ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // Google sign-in returns a one-time code to the app, swapped for a session.
        flowType: "pkce",
      },
    })
  : null;

// Refresh the session only while the app is in the foreground.
if (supabase && Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
