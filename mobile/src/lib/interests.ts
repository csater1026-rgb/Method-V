// What this person is into, learned on this device from what they watch,
// like, open, try and skip in Drops, for the "For you" ranking. Same scores
// and rules as the website (src/lib/interests.ts); kept in AsyncStorage.

import AsyncStorage from "@react-native-async-storage/async-storage";

import { SIGNALS, bumpInterest, parseInterests, serializeInterests, type Interests } from "@shared/interests";

const KEY = "method-v-interests";

let cache: Interests | null = null;

export async function loadInterests(): Promise<Interests> {
  if (cache) return cache;
  try {
    cache = parseInterests(await AsyncStorage.getItem(KEY));
  } catch {
    cache = {};
  }
  return cache;
}

export function learn(category: string, signal: keyof typeof SIGNALS) {
  void (async () => {
    const next = bumpInterest(await loadInterests(), category, SIGNALS[signal]);
    cache = next;
    try {
      await AsyncStorage.setItem(KEY, serializeInterests(next));
    } catch {
      // Storage unavailable: it just doesn't remember past this session.
    }
  })();
}
