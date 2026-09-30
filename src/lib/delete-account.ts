import "server-only";

import { confirmMatches } from "./account";
import { LEGAL, OFFICIAL_HANDLE } from "./constants";
import { DROPS_BUCKET, FEEDBACK_BUCKET } from "./supabase/env";
import { createAdminClient } from "./supabase/server";

// Deleting your own account (Edit profile on the website, the Me tab in the
// app). Apple requires apps with sign-up to offer this in the app.
//
// It refuses while money is in the middle of moving (an open sponsorship
// deal, a sponsorship budget still running, a payout on its way), so nobody
// loses a payment. Otherwise it deletes every file in the person's storage
// folder, then the sign-in account, which removes the profile and everything
// attached to it in the database (the foreign keys cascade). Stripe keeps its
// own records of past payments.

export type DeleteAccountResult = { ok: true } | { ok: false; error: string };

// Deal and sponsorship states where someone's money is held.
const OPEN_DEALS = ["requested", "accepted", "delivered", "disputed"];
const OPEN_SPONSORSHIPS = ["offered", "accepted", "active"];

export async function deleteAccount(userId: string, typed: string): Promise<DeleteAccountResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: `Deleting accounts isn't switched on yet. Email ${LEGAL.email} and we'll do it for you.` };

  const { data: profile } = await admin.from("profiles").select("username").eq("id", userId).maybeSingle();
  const username = (profile?.username as string | undefined) ?? "";
  if (!username) return { ok: false, error: "Couldn't find your account." };
  if (!confirmMatches(typed, username)) return { ok: false, error: `Type your username (${username}) to confirm.` };
  if (username === OFFICIAL_HANDLE) return { ok: false, error: "Method V's official account can't be deleted from here." };

  const either = `sponsor_user.eq.${userId},host_user.eq.${userId}`;
  const [deals, sponsorships, payouts] = await Promise.all([
    admin.from("package_deals").select("id", { count: "exact", head: true }).or(either).in("status", OPEN_DEALS),
    admin.from("sponsorships").select("id", { count: "exact", head: true }).or(either).in("status", OPEN_SPONSORSHIPS),
    admin.from("payouts").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("status", "pending"),
  ]);
  if (deals.error || sponsorships.error || payouts.error) return { ok: false, error: "Couldn't check your account. Try again in a minute." };
  if ((deals.count ?? 0) > 0) {
    return { ok: false, error: "You have a sponsorship deal in progress. Finish or cancel it on the Earn page first, so nobody loses their money." };
  }
  if ((sponsorships.count ?? 0) > 0) {
    return { ok: false, error: "You have a sponsorship that's still running. End it on the Earn page first, so nobody loses their money." };
  }
  if ((payouts.count ?? 0) > 0) return { ok: false, error: "A payout to you is on its way. Try again once it arrives." };

  // Every file lives under <bucket>/<user id>/: videos, posters and photos in
  // drops, feedback screenshots in feedback.
  for (const name of [DROPS_BUCKET, FEEDBACK_BUCKET]) {
    const bucket = admin.storage.from(name);
    for (;;) {
      const { data: files, error } = await bucket.list(userId, { limit: 100 });
      // Before the screenshots migration there's no feedback bucket: nothing to delete.
      if (error && name === FEEDBACK_BUCKET && /not found/i.test(error.message)) break;
      if (error) return { ok: false, error: "Couldn't delete your files. Try again in a minute." };
      if (!files?.length) break;
      const { error: removeError } = await bucket.remove(files.map((f) => `${userId}/${f.name}`));
      if (removeError) return { ok: false, error: "Couldn't delete your files. Try again in a minute." };
      if (files.length < 100) break;
    }
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("delete account failed", error.message);
    return { ok: false, error: `Couldn't delete your account. Try again, or email ${LEGAL.email}.` };
  }
  return { ok: true };
}
