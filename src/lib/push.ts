import "server-only";

import webpush from "web-push";

import { deadExpoTokens, isExpoToken, type PushMessage } from "./push-core";

// Sending push notifications. Phones get them through Expo's push service;
// browsers through Web Push (VAPID keys). Each part is off until its keys
// are set, and the send endpoint refuses everything until the webhook
// secret is set, so a half-configured site fails closed.

export const webhookSecret = process.env.PUSH_WEBHOOK_SECRET ?? "";
const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const vapidPrivate = process.env.VAPID_PRIVATE_KEY ?? "";
const expoAccessToken = process.env.EXPO_ACCESS_TOKEN ?? "";
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");

export const isWebPushConfigured = Boolean(vapidPublic && vapidPrivate);

if (isWebPushConfigured) {
  try {
    webpush.setVapidDetails(siteUrl.startsWith("https://") ? siteUrl : "mailto:push@methodv.app", vapidPublic, vapidPrivate);
  } catch (e) {
    console.error("Web Push keys don't look right", e);
  }
}

// Returns the tokens Expo says are gone (app uninstalled), to delete.
export async function sendToPhones(tokens: string[], message: PushMessage): Promise<{ sent: number; dead: string[] }> {
  const valid = tokens.filter(isExpoToken);
  if (valid.length === 0) return { sent: 0, dead: [] };
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (expoAccessToken) headers.Authorization = `Bearer ${expoAccessToken}`;
  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers,
    body: JSON.stringify(
      valid.map((to) => ({
        to,
        title: message.title,
        body: message.body,
        sound: "default",
        data: { url: message.url, kind: message.kind },
      })),
    ),
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    console.error("Expo push error", res.status, json);
    return { sent: 0, dead: [] };
  }
  const dead = deadExpoTokens(valid, json);
  return { sent: valid.length - dead.length, dead };
}

type Subscription = { endpoint: string; p256dh: string; auth: string };

// Returns the endpoints the browser's push service says are gone, to delete.
export async function sendToBrowsers(subs: Subscription[], message: PushMessage): Promise<{ sent: number; dead: string[] }> {
  if (!isWebPushConfigured || subs.length === 0) return { sent: 0, dead: [] };
  const payload = JSON.stringify({ title: message.title, body: message.body, url: message.url });
  const dead: string[] = [];
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 60 * 60 * 24 });
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.endpoint);
        else console.error("Web push error", status);
      }
    }),
  );
  return { sent, dead };
}
