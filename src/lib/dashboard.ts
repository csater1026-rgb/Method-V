import "server-only";

import { ANALYTICS_FREE_DAYS, ANALYTICS_RANGES } from "./constants";
import { getMyApps, getOwnProfile, getViewer, isPro } from "./data";
import { demoApps, demoProfiles } from "./demo";
import { isSupabaseConfigured } from "./supabase/env";

// Who's looking at the dashboard, which of their apps, and how far back they
// may look. Demo mode previews it as Ada (a Pro builder).
export async function dashboardContext(appSlug: string | undefined, daysParam: string | undefined) {
  const viewer = await getViewer();
  const profile = isSupabaseConfigured ? await getOwnProfile() : demoProfiles[0];
  const pro = isPro(profile);
  const apps = isSupabaseConfigured
    ? await getMyApps(viewer)
    : demoApps.filter((a) => a.owner_id === profile?.id).map((a) => ({ id: a.id, slug: a.slug, name: a.name }));
  const app = apps.find((a) => a.slug === appSlug) ?? apps[0] ?? null;
  const asked = Number(daysParam);
  const wanted = (ANALYTICS_RANGES as readonly number[]).includes(asked) ? asked : ANALYTICS_FREE_DAYS;
  const days = wanted > ANALYTICS_FREE_DAYS && !pro ? ANALYTICS_FREE_DAYS : wanted;
  return { viewer, profile, pro, apps, app, days, lockedRange: wanted !== days };
}
