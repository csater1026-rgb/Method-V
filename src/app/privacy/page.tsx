import type { Metadata } from "next";

import { LegalPage, MailLink, Section } from "@/components/Legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What Method V collects, why, who helps us run it, what's public, and how to delete your data.",
};

// Keep this in step with what the site actually stores (supabase/setup.sql)
// and who it's sent to (Supabase, Vercel, Stripe, Resend, push services).
export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          This explains what Method V collects when you use methodv.app or the Method V app, why, and what you can do about it. The short
          version: we collect what we need to run Method V, we don&apos;t sell your data, and we don&apos;t use advertising trackers.
        </p>
      }
    >
      <Section title="1. What we collect">
        <ul>
          <li>
            <strong>Your account:</strong> your email address and password (stored scrambled, so nobody can read it, including us). If you
            sign in with Google, Apple or GitHub, we get your name and email address from them.
          </li>
          <li>
            <strong>Your profile:</strong> your username, company name, bio, photo, status and the social links you add.
          </li>
          <li>
            <strong>What you post:</strong> apps, Drops (videos), questions, answers, polls and votes, feedback, and messages you
            send to other people.
          </li>
          <li>
            <strong>What you do:</strong> likes, follows, which apps you open with Try it (and from where on Method V), your Methodium history,
            and your notification settings.
          </li>
          <li>
            <strong>Payments:</strong> what you bought and for how much. Stripe handles your card; we never see or store your full card
            number. If you set up payouts, Stripe collects your identity and bank details and gives us an account ID.
          </li>
          <li>
            <strong>Your devices:</strong> if you turn on notifications, a push token for your phone or browser so we can send them.
          </li>
          <li>
            <strong>Technical logs:</strong> our hosting providers keep short-lived logs (such as IP addresses and browser type) to keep the
            site running and secure.
          </li>
        </ul>
      </Section>

      <Section title="2. How we use it">
        <ul>
          <li>To run Method V: sign you in, show your profile and posts, and deliver messages and notifications.</li>
          <li>To show you apps and Drops you&apos;re likely to enjoy, based on what you like and try on Method V.</li>
          <li>To give builders stats about their apps (for example, how many people tried an app and from where).</li>
          <li>To handle Methodium, payments, sponsorships and payouts.</li>
          <li>To send account emails (like confirming your email or signing in) and notifications you&apos;ve turned on.</li>
          <li>To keep Method V safe: stop spam, fake engagement and abuse.</li>
        </ul>
      </Section>

      <Section title="3. What other people can see">
        <p>
          <strong>Public to other members:</strong> your profile (username, name, bio, photo, status, social links), your apps and Drops,
          questions and answers, your Tester Passport, and who you follow.
        </p>
        <p>
          <strong>Private:</strong> your email address, your Methodium balance and history, your payments and earnings, and your messages
          (only you and the person you&apos;re talking to). Feedback you give on an app is seen only by you and that app&apos;s builder;
          app pages show only totals.
        </p>
      </Section>

      <Section title="4. Who helps us run Method V">
        <p>We don&apos;t sell your data. We share it only with the services that run Method V for us, and only what each one needs:</p>
        <ul>
          <li><strong>Supabase:</strong> our database, file storage and sign-in.</li>
          <li><strong>Vercel:</strong> hosts the website and counts visits (without cookies).</li>
          <li><strong>Stripe:</strong> payments and payouts.</li>
          <li><strong>Resend:</strong> sends our emails.</li>
          <li>
            <strong>Push services</strong> (Apple, Google, Expo and your browser&apos;s maker): deliver notifications, if you turn them on.
          </li>
          <li><strong>Google, Apple or GitHub:</strong> only if you choose to sign in with them.</li>
        </ul>
        <p>We may also share information if the law requires it, or to protect people&apos;s safety.</p>
      </Section>

      <Section title="5. Cookies and storage">
        <p>
          We use cookies to keep you signed in, and your browser&apos;s storage to remember small things like light or dark mode and whether
          you&apos;ve seen the tour. We don&apos;t use advertising or tracking cookies.
        </p>
        <p>
          We count visits with Vercel Web Analytics, which tells us things like how many people opened a page and from what kind of device.
          It doesn&apos;t use cookies and doesn&apos;t identify you.
        </p>
      </Section>

      <Section title="6. How long we keep it">
        <p>
          We keep your information while you have an account. When you delete something, it&apos;s removed from Method V. When you delete
          your account, your profile, posts, files and history are deleted right away (backups roll over within 30 days). Records of past
          payments are kept by Stripe for as long as tax and accounting laws require.
        </p>
      </Section>

      <Section title="7. Your choices">
        <ul>
          <li>Edit your profile, and delete your questions and answers, at any time.</li>
          <li>To remove an app or a Drop, email us and we&apos;ll take it down.</li>
          <li>Turn notifications on or off in your settings.</li>
          <li>
            Delete your account at any time: <strong>Delete account</strong> at the bottom of Edit profile on the website, or on the Me tab
            in the app.
          </li>
          <li>
            Ask for a copy of your data, or ask us to correct it, by emailing <MailLink /> from the email address on your
            account.
          </li>
        </ul>
        <p>Depending on where you live, you may have other rights over your data. Email us and we&apos;ll help.</p>
      </Section>

      <Section title="8. Children">
        <p>
          Method V is not for children under 13, and we don&apos;t knowingly collect their information. If you think a child under 13 has
          an account, email us and we&apos;ll delete it.
        </p>
      </Section>

      <Section title="9. Security and where data is kept">
        <p>
          We use encrypted connections, keep passwords scrambled, and limit who can see what in our database. No system is perfectly
          secure, but we work to protect your information. Our providers store data in the United States and other countries where they
          operate.
        </p>
      </Section>

      <Section title="10. Changes">
        <p>
          If we change this policy, we&apos;ll update the date at the top, and for big changes we&apos;ll let you know on the site or by
          email.
        </p>
      </Section>
    </LegalPage>
  );
}
