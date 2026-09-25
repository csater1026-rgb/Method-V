import { NextResponse } from "next/server";

import { settleRefunds } from "@/lib/payments";
import { connectWebhookSecret, isStripeConfigured, webhookSecret } from "@/lib/stripe";
import { verifyStripeSignature } from "@/lib/stripe-core";
import { createAdminClient } from "@/lib/supabase/server";

type StripeEvent = {
  type: string;
  data: { object: Record<string, unknown> };
};

// Stripe tells us here when a Checkout is paid and when a builder's payout
// account changes. Only signed requests are accepted, and completing a
// payment is idempotent, so Stripe's retries are harmless.
export async function POST(request: Request) {
  if (!isStripeConfigured) return new NextResponse("Payments are off", { status: 404 });
  const admin = createAdminClient();
  if (!admin) return new NextResponse("Server not configured", { status: 503 });

  const payload = await request.text();
  const signature = request.headers.get("stripe-signature");
  // Your own account's destination: payments and payout accounts. The
  // connected-accounts destination: payout accounts only, never payments.
  const fromPlatform = verifyStripeSignature(payload, signature, webhookSecret);
  const fromConnect = !fromPlatform && verifyStripeSignature(payload, signature, connectWebhookSecret);
  if (!fromPlatform && !fromConnect) {
    return new NextResponse("Bad signature", { status: 400 });
  }

  const event = JSON.parse(payload) as StripeEvent;
  const obj = event.data.object;

  if (fromPlatform && (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded")) {
    if (obj.payment_status !== "paid") return NextResponse.json({ received: true });
    const paymentId = (obj.metadata as Record<string, string> | null)?.payment_id;
    if (!paymentId) return NextResponse.json({ received: true });
    const { error } = await admin.rpc("complete_payment", {
      p_id: paymentId,
      p_session: obj.id,
      p_amount: obj.amount_total,
      p_intent: typeof obj.payment_intent === "string" ? obj.payment_intent : null,
    });
    if (error) {
      console.error("complete_payment failed", paymentId, error.message);
      // A database hiccup is worth a retry; a bad amount or unknown payment isn't.
      return new NextResponse("Could not record payment", { status: error.code === "P0001" ? 400 : 500 });
    }
    // A payment for a deal that was called off meanwhile goes straight back.
    await settleRefunds(admin, { paymentId });
  } else if (event.type === "account.updated") {
    await admin
      .from("payout_accounts")
      .update({ payouts_enabled: Boolean(obj.payouts_enabled && obj.details_submitted), updated_at: new Date().toISOString() })
      .eq("stripe_account_id", obj.id as string);
  }

  return NextResponse.json({ received: true });
}
