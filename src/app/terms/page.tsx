import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage, MailLink, Section } from "@/components/Legal";
import { EARN, PACKAGE_RULES, formatCents } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using Method V: your account, your content, V Coin, Pro, tips, sponsorships and payouts.",
};

// Written in plain English on purpose. The numbers come from constants.ts so
// they can't drift from what the site actually charges.
export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms are the deal between you and Method V (&ldquo;we&rdquo;, &ldquo;us&rdquo;) when you use methodv.app or the Method V
          app. By creating an account or using Method V, you agree to them. If you don&apos;t agree, please don&apos;t use Method V.
        </p>
      }
    >
      <Section title="1. Your account">
        <ul>
          <li>You must be at least 13 years old to use Method V.</li>
          <li>
            To buy anything (V Coin, Pro, tips or sponsorships) you must be 18, or have a parent or guardian&apos;s permission. To get paid
            (payouts) you must be 18 or older, because our payment partner requires it.
          </li>
          <li>One person per account. Give us a real email address and keep your password to yourself. You&apos;re responsible for what happens on your account.</li>
          <li>Don&apos;t pretend to be someone else, and don&apos;t take a username just to hold it or to confuse people.</li>
        </ul>
      </Section>

      <Section title="2. Your content">
        <p>
          You own what you post: your apps, Drops (videos), photos, comments, questions, answers and feedback. When you post something, you
          give us permission to store it, show it on Method V, and use it to promote Method V (for example, featuring your Drop on Home or
          sharing it on our social accounts). This permission ends when you delete the content or your account, except for copies that were
          already shared or that we must keep by law.
        </p>
        <p>
          Only post things you have the right to post. If you link an app, you&apos;re responsible for that app and what it does, including keeping the people who try it, and their data, safe.
        </p>
      </Section>

      <Section title="3. The rules">
        <p>Don&apos;t use Method V to:</p>
        <ul>
          <li>break the law, or post anything illegal;</li>
          <li>share malware, phishing, scams, or apps that secretly collect people&apos;s data;</li>
          <li>harass, threaten or bully anyone, or post hate speech;</li>
          <li>post sexual content, graphic violence, or anything involving minors in a harmful way;</li>
          <li>spam, or fake engagement: fake likes, follows, tries or feedback, or several accounts to farm V Coin;</li>
          <li>copy other people&apos;s work and post it as your own;</li>
          <li>scrape the site, get around limits, or try to break into accounts or our systems.</li>
        </ul>
        <p>
          We can remove content, take away V Coin earned by breaking these rules, and suspend or close accounts that break them. If
          something breaks the rules, email us at <MailLink />.
        </p>
      </Section>

      <Section title="4. Trying other people's apps">
        <p>
          Apps on Method V are made by other builders, not by us. We don&apos;t check or guarantee them. Try them at your own risk, and
          think twice before entering passwords, payment details or other sensitive information into an app you found here.
        </p>
      </Section>

      <Section title="5. V Coin">
        <p>V Coin is what we call credits on Method V. You earn them by testing apps and giving feedback, and you can buy packs.</p>
        <ul>
          <li>V Coin only works on Method V. It has no cash value and can&apos;t be turned into money, sold, or moved to another account.</li>
          <li>Purchases of V Coin are final, except where the law says otherwise.</li>
          <li>We may change how many V Coin things cost or earn. We&apos;ll never take away V Coin you earned or bought fairly.</li>
          <li>If we ever shut Method V down, we&apos;ll give at least 30 days&apos; notice so you can use your V Coin.</li>
        </ul>
      </Section>

      <Section title="6. Pro">
        <p>
          Pro costs {formatCents(EARN.pro.price)} for {EARN.pro.days} days. It&apos;s a one-time payment, not a subscription: it never renews
          on its own. Pro purchases are final, except where the law says otherwise. We may add or change Pro perks over time.
        </p>
      </Section>

      <Section title="7. Tips, sponsorships and payouts">
        <ul>
          <li>
            Payments are handled by <a href="https://stripe.com/legal" className="text-accent hover:underline">Stripe</a>. We never see or
            store your full card number.
          </li>
          <li>
            Builders get paid through Stripe Connect, which means agreeing to Stripe&apos;s{" "}
            <a href="https://stripe.com/legal/connect-account" className="text-accent hover:underline">
              Connected Account Agreement
            </a>
            . Stripe may ask for your identity and bank details. The smallest payout is {formatCents(EARN.payoutMin)}.
          </li>
          <li>
            Method V keeps a fee on money that goes to builders: {EARN.tip.feePercent}% of tips, and {PACKAGE_RULES.feePercent}% of
            sponsorship packages ({PACKAGE_RULES.proFeePercent}% with Pro). The fee is shown before you pay.
          </li>
          <li>You&apos;re responsible for any taxes on money you earn through Method V.</li>
          <li>If a payment is refunded or disputed, we may take the matching amount back out of the builder&apos;s earnings.</li>
        </ul>
        <p>
          <strong>Sponsorship packages.</strong> Builders set their own prices. The sponsor pays up front and we hold the money. The builder
          has {PACKAGE_RULES.answerDays} days to accept, or the sponsor is refunded in full. After accepting, the builder has{" "}
          {PACKAGE_RULES.deliverDays} days to deliver. Once it&apos;s delivered, the sponsor has {PACKAGE_RULES.approveDays} days to approve it
          or report a problem; if they do neither, it&apos;s approved automatically and the builder is paid. If there&apos;s a problem, we
          look at both sides and decide whether the sponsor gets a refund.
        </p>
        <p>
          <strong>Label paid promotion.</strong> If you&apos;re paid to promote something in a video, post or newsletter, say so clearly
          (for example, &ldquo;#ad&rdquo; or &ldquo;Sponsored&rdquo;), as the law requires. Sponsored spots on Method V are labeled for you.
        </p>
      </Section>

      <Section title="8. Our service">
        <p>
          We&apos;re a small, growing service and we&apos;ll keep changing and improving it. We may add, change or remove features. Method V
          is provided &ldquo;as is&rdquo;: we work hard to keep it running and safe, but we can&apos;t promise it will always be available or
          free of mistakes.
        </p>
        <p>
          To the extent the law allows, we aren&apos;t responsible for indirect losses (like lost profits or data), or for what other people
          or their apps do. Our total responsibility to you for any claim is limited to the greater of what you paid us in the 12 months
          before the claim, or $50.
        </p>
      </Section>

      <Section title="9. Leaving Method V">
        <p>
          You can stop using Method V at any time. To delete your account, use <strong>Delete account</strong> at the bottom of Edit profile
          on the website, or on the Me tab in the app. It can&apos;t be done while a sponsorship deal or payout is still in progress, so
          nobody loses money. Deleting your account also deletes your V Coin and any earnings not yet paid out. See
          the <Link href="/privacy" className="text-accent hover:underline">Privacy Policy</Link> for what happens to your data.
        </p>
        <p>
          We can suspend or close an account that breaks these terms. If we close your account for another reason, we&apos;ll tell you
          and pay out any earnings you&apos;re owed.
        </p>
      </Section>

      <Section title="10. Changes to these terms">
        <p>
          We may update these terms as Method V grows. We&apos;ll change the date at the top, and for big changes we&apos;ll let you know on
          the site or by email. If you keep using Method V after a change, you accept the new terms.
        </p>
      </Section>
    </LegalPage>
  );
}
