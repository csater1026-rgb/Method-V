import "server-only";

import { createAdminClient } from "./supabase/server";
import { createRefund, getConnectAccount, isStripeConfigured } from "./stripe";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

// Sends back money the database has marked for refund (unspent sponsorship
// budget, or a payment for a deal that was called off). Safe to run again:
// Stripe refunds use an idempotency key and rows are marked once done.
export async function settleRefunds(admin: Admin, filter: { paymentId?: string; userId?: string }) {
  if (!isStripeConfigured) return;
  let query = admin
    .from("payments")
    .select("id, refund_cents, stripe_payment_intent")
    .gt("refund_cents", 0)
    .is("refunded_at", null)
    .not("stripe_payment_intent", "is", null)
    .limit(20);
  if (filter.paymentId) query = query.eq("id", filter.paymentId);
  if (filter.userId) query = query.eq("user_id", filter.userId);
  const { data } = await query;
  for (const p of data ?? []) {
    try {
      await createRefund(p.id, p.stripe_payment_intent as string, p.refund_cents);
      await admin.rpc("mark_refunded", { p_id: p.id });
    } catch (e) {
      // Left unmarked; retried the next time the sponsor opens /earn.
      console.error("Refund failed", p.id, e);
    }
  }
}

// After Stripe onboarding, read the account back rather than waiting for the
// webhook, so "Cash out" appears straight away.
export async function syncPayoutAccount(admin: Admin, userId: string) {
  if (!isStripeConfigured) return;
  const { data } = await admin.from("payout_accounts").select("stripe_account_id").eq("user_id", userId).maybeSingle();
  if (!data) return;
  try {
    const acct = await getConnectAccount(data.stripe_account_id);
    await admin
      .from("payout_accounts")
      .update({ payouts_enabled: acct.payouts_enabled && acct.details_submitted, updated_at: new Date().toISOString() })
      .eq("user_id", userId);
  } catch (e) {
    console.error("Couldn't read payout account", e);
  }
}
