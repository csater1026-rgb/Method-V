"use client";

import { useSyncExternalStore } from "react";

import { formatCount } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Live "tries" numbers. Every count on the page registers its app here, and
// one small query refreshes them all: when you come back to the tab (after
// trying an app, which opens in a new tab), a few seconds after you tap a
// Try it button, and every 20 seconds while you're looking. Just the numbers
// change, so the feed never reshuffles under you.

const EVERY_MS = 20_000;
const latest = new Map<string, number>();
const watchers = new Map<string, Set<() => void>>();
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight = false;

async function refresh() {
  if (!isSupabaseConfigured || inFlight || watchers.size === 0 || document.visibilityState !== "visible") return;
  inFlight = true;
  try {
    const ids = [...watchers.keys()];
    const { data } = await createClient().from("apps").select("id, try_count").in("id", ids);
    for (const row of data ?? []) {
      if (latest.get(row.id) === row.try_count) continue;
      latest.set(row.id, row.try_count);
      watchers.get(row.id)?.forEach((notify) => notify());
    }
  } finally {
    inFlight = false;
  }
}

function onVisible() {
  if (document.visibilityState === "visible") void refresh();
}

// A tap on any Try it link (they all go through /try/<app>): the try is
// counted as it opens, so check again shortly after.
function onClick(e: MouseEvent) {
  const link = (e.target as Element | null)?.closest?.('a[href^="/try/"]');
  if (!link) return;
  setTimeout(() => void refresh(), 1500);
  setTimeout(() => void refresh(), 5000);
}

function start() {
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("pageshow", onVisible);
  window.addEventListener("focus", onVisible);
  document.addEventListener("click", onClick, true);
  timer = setInterval(() => void refresh(), EVERY_MS);
}

function stop() {
  document.removeEventListener("visibilitychange", onVisible);
  window.removeEventListener("pageshow", onVisible);
  window.removeEventListener("focus", onVisible);
  document.removeEventListener("click", onClick, true);
  if (timer) clearInterval(timer);
  timer = null;
}

function watch(appId: string, notify: () => void) {
  if (watchers.size === 0) start();
  const set = watchers.get(appId) ?? new Set();
  set.add(notify);
  watchers.set(appId, set);
  return () => {
    set.delete(notify);
    if (set.size === 0) watchers.delete(appId);
    if (watchers.size === 0) stop();
  };
}

// The newest try count for an app: what the page came with, or a fresher one.
export function useTryCount(appId: string, initial: number): number {
  const live = useSyncExternalStore(
    (notify) => watch(appId, notify),
    () => latest.get(appId),
    () => undefined,
  );
  // Tries only go up, so the bigger number is the newer one.
  return Math.max(initial, live ?? 0);
}

export function TryCount({ appId, count }: { appId: string; count: number }) {
  return <>{formatCount(useTryCount(appId, count))}</>;
}
