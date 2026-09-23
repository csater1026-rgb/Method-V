// Pure helpers for talking to Stripe without its SDK: encoding request
// bodies and checking webhook signatures. Kept free of server-only imports
// so the unit tests can load them.

import { createHmac, timingSafeEqual } from "node:crypto";

type Params = { [key: string]: string | number | boolean | null | undefined | Params | Params[] | string[] };

// Stripe takes form bodies with nested keys: a[b][0][c]=1.
export function formEncode(params: Params, prefix = ""): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (typeof item === "object") parts.push(formEncode(item, `${name}[${i}]`));
        else parts.push(`${encodeURIComponent(`${name}[${i}]`)}=${encodeURIComponent(String(item))}`);
      });
    } else if (typeof value === "object") {
      parts.push(formEncode(value, name));
    } else {
      parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`);
    }
  }
  return parts.filter(Boolean).join("&");
}

export type { Params as StripeParams };

// Checks a Stripe-Signature header ("t=...,v1=...,v1=...") against the raw
// request body. Rejects anything older than `toleranceSeconds`, so a captured
// webhook can't be replayed later.
export function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds = Math.floor(Date.now() / 1000),
  toleranceSeconds = 300,
): boolean {
  if (!header || !secret) return false;
  let timestamp = "";
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") timestamp = value;
    else if (key === "v1") signatures.push(value);
  }
  if (!/^\d+$/.test(timestamp) || signatures.length === 0) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return false;

  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`, "utf8").digest();
  return signatures.some((sig) => {
    if (!/^[0-9a-f]{64}$/.test(sig)) return false;
    return timingSafeEqual(Buffer.from(sig, "hex"), expected);
  });
}
