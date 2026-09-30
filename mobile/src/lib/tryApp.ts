import * as WebBrowser from "expo-web-browser";
import { Alert } from "react-native";

import type { SponsorCard } from "@shared/types";

import { recordBrandVisit, recordTry } from "./data";
import { refreshTryCounts } from "./tryCount";

// "Try it": count the try, then open the app in an in-app browser so people
// come straight back to Method V when they close it.
export async function tryApp(slug: string, sponsorshipId?: string) {
  const r = await recordTry(slug, sponsorshipId);
  if (!r.ok) return Alert.alert("Can't open that", r.error);
  void refreshTryCounts();
  await WebBrowser.openBrowserAsync(r.data);
  // Back from trying it: show the new count.
  void refreshTryCounts();
}

export async function openSponsor(sponsor: SponsorCard) {
  if (sponsor.kind === "app") return tryApp(sponsor.slug, sponsor.id);
  const r = await recordBrandVisit(sponsor.slug, sponsor.id);
  if (!r.ok) return Alert.alert("Can't open that", r.error);
  await WebBrowser.openBrowserAsync(r.data);
}
