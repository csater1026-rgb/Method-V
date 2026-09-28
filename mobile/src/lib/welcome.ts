import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

// "Skip for now" on the Set up your profile screen, remembered per account
// on this phone (like the website's cookie), so it isn't shown again.
const key = (userId: string) => `method-v-profile-later:${userId}`;
const listeners = new Set<() => void>();

export async function skipProfileSetup(userId: string): Promise<void> {
  await AsyncStorage.setItem(key(userId), "1").catch(() => {});
  for (const fn of listeners) fn();
}

// null while it's being read from the phone.
export function useProfileSetupSkipped(userId: string | null): boolean | null {
  const [state, setState] = useState<{ userId: string | null; skipped: boolean | null }>({ userId: null, skipped: null });
  useEffect(() => {
    if (!userId) return;
    let live = true;
    const read = () =>
      AsyncStorage.getItem(key(userId))
        .then((v) => live && setState({ userId, skipped: v === "1" }))
        .catch(() => live && setState({ userId, skipped: false }));
    void read();
    listeners.add(read);
    return () => {
      live = false;
      listeners.delete(read);
    };
  }, [userId]);
  return userId && state.userId === userId ? state.skipped : null;
}
