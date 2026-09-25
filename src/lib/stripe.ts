import "server-only";

import { formEncode, type StripeParams } from "./stripe-core";

// Stripe, called over its REST API. Payments are switched off unless both the
// secret key and the webhook signing secret are set (the webhook is what
// actually credits a payment), so a half-configured site fails closed.

const secretKey = process.env.STRIPE_SECRET_KEY ?? "";
// Stripe sends your own payments and your builders' payout accounts to two
// separate webhook destinations, each with its own signing secret.
export const webhookSecrets = [process.env.STRIPE_WEBHOOK_SECRET ?? "", process.env.STRIPE_CONNECT_WEBHOOK_SECRET ?? ""].filter(Boolean);
export const isStripeConfigured = Boolean(secretKey && process.env.STRIPE_WEBHOOK_SECRET);

export const PAYMENTS_OFF_MESSAGE = "Payments aren't switched on for this site yet.";

export class StripeError extends Error {}

async function stripe<T>(method: "GET" | "POST", path: string, params?: StripeParams, idempotencyKey?: string): Promise<T> {
  if (!isStripeConfigured) throw new StripeError(PAYMENTS_OFF_MESSAGE);
  const headers: Record<string, string> = { Authorization: `Bearer ${secretKey}` };
  let url = `https://api.stripe.com/v1/${path}`;
  let body: string | undefined;
  if (params && method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = formEncode(params);
  } else if (params) {
    url += `?${formEncode(params)}`;
  }
  if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;

  const res = await fetch(url, { method, headers, body, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    console.error("Stripe error", path, res.status, json.error?.message);
    throw new StripeError("The payment service had a problem. Try again in a moment.");
  }
  return json;
}

// One-off Checkout for a prepared payment. The payment id rides along in
// metadata so the webhook knows what was paid for.
export async function createCheckout(opts: {
  paymentId: string;
  amountCents: number;
  name: string;
  description?: string;
  successUrl: string;
  cancelUrl: string;
  email?: string;
}): Promise<{ id: string; url: string }> {
  return stripe<{ id: string; url: string }>(
    "POST",
    "checkout/sessions",
    {
      mode: "payment",
      success_url: opts.successUrl,
      cancel_url: opts.cancelUrl,
      customer_email: opts.email,
      client_reference_id: opts.paymentId,
      metadata: { payment_id: opts.paymentId },
      payment_intent_data: { metadata: { payment_id: opts.paymentId } },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: opts.amountCents,
            product_data: { name: opts.name, description: opts.description || undefined },
          },
        },
      ],
    },
    `checkout-${opts.paymentId}`,
  );
}

export async function createConnectAccount(userId: string, email?: string): Promise<{ id: string }> {
  return stripe<{ id: string }>(
    "POST",
    "accounts",
    {
      type: "express",
      email,
      metadata: { user_id: userId },
      capabilities: { transfers: { requested: true } },
    },
    `account-${userId}`,
  );
}

export async function getConnectAccount(accountId: string) {
  return stripe<{ id: string; payouts_enabled: boolean; details_submitted: boolean }>("GET", `accounts/${accountId}`);
}

export async function createOnboardingLink(accountId: string, refreshUrl: string, returnUrl: string) {
  return stripe<{ url: string }>("POST", "account_links", {
    account: accountId,
    type: "account_onboarding",
    refresh_url: refreshUrl,
    return_url: returnUrl,
  });
}

export async function createTransfer(payoutId: string, amountCents: number, accountId: string) {
  return stripe<{ id: string }>(
    "POST",
    "transfers",
    { amount: amountCents, currency: "usd", destination: accountId, metadata: { payout_id: payoutId } },
    `payout-${payoutId}`,
  );
}

export async function createRefund(paymentId: string, paymentIntent: string, amountCents: number) {
  return stripe<{ id: string }>(
    "POST",
    "refunds",
    { payment_intent: paymentIntent, amount: amountCents, metadata: { payment_id: paymentId } },
    `refund-${paymentId}-${amountCents}`,
  );
}
