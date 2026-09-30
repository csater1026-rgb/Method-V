import { useSyncExternalStore } from "react";
import { AppState, type NativeEventSubscription } from "react-native";

import { supabase } from "./supabase";

// Live "tries" numbers, like the website. Every count on screen registers its
// app here, and one small query refreshes them all: when the app comes back
// to the front, right after someone closes an app they tried, and every 20
// seconds. Just the numbers change, so the feed never reshuffles.

const EVERY_MS = 20_000;
const latest = new Map<string, number>();
const watchers = new Map<string, Set<() => void>>();
let timer: ReturnType<typeof setInterval> | null = null;
let appState: NativeEventSubscription | null = null;
let inFlight = false;

export async function refreshTryCounts() {
  if (!supabase || inFlight || watchers.size === 0 || AppState.currentState !== "active") return;
  inFlight = true;
  try {
    const { data } = await supabase.from("apps").select("id, try_count").in("id", [...watchers.keys()]);
    for (const row of data ?? []) {
      if (latest.get(row.id) === row.try_count) continue;
      latest.set(row.id, row.try_count);
      watchers.get(row.id)?.forEach((notify) => notify());
    }
  } finally {
    inFlight = false;
  }
}

function watch(appId: string, notify: () => void) {
  if (watchers.size === 0) {
    appState = AppState.addEventListener("change", (state) => state === "active" && void refreshTryCounts());
    timer = setInterval(() => void refreshTryCounts(), EVERY_MS);
  }
  const set = watchers.get(appId) ?? new Set();
  set.add(notify);
  watchers.set(appId, set);
  return () => {
    set.delete(notify);
    if (set.size === 0) watchers.delete(appId);
    if (watchers.size === 0) {
      appState?.remove();
      appState = null;
      if (timer) clearInterval(timer);
      timer = null;
    }
  };
}

// The newest try count for an app: what the screen loaded, or a fresher one.
export function useTryCount(appId: string, initial: number): number {
  const live = useSyncExternalStore(
    (notify) => watch(appId, notify),
    () => latest.get(appId),
  );
  // Tries only go up, so the bigger number is the newer one.
  return Math.max(initial, live ?? 0);
}
