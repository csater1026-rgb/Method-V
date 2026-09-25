// Method V's sign-in emails, for Supabase → Authentication → Emails →
// Templates. /setup/emails shows each one with Copy buttons. The {{ .X }}
// parts are Supabase's placeholders: it fills in the link, the 6-digit code
// (the phone app asks for it) and email addresses when it sends.

import { V_HEIGHT, V_WIDTH, pixelVRects } from "./pixel-v.ts";

export type EmailTemplate = {
  // The template's name in the Supabase dashboard.
  supabaseName: string;
  subject: string;
  html: string;
};

const INK = "#0b1622";
const MUTED = "#5b6b7c";
const ACCENT = "#40f4f5";
const ACCENT_INK = "#04213a";
const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

// The logo's pixel V as a grid of table cells: shows even when a mail app
// blocks images.
function pixelV(cell = 4): string {
  const grid: (string | null)[][] = Array.from({ length: V_HEIGHT }, () => Array(V_WIDTH).fill(null));
  for (const r of pixelVRects()) {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) grid[y][x] = r.fill;
  }
  const rows = grid
    .map(
      (row) =>
        `<tr>${row
          .map((fill) => `<td width="${cell}" height="${cell}" style="width:${cell}px;height:${cell}px;font-size:0;line-height:0;${fill ? `background:${fill};` : ""}"${fill ? ` bgcolor="${fill}"` : ""}></td>`)
          .join("")}</tr>`,
    )
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">${rows}</table>`;
}

function layout({ heading, intro, button, code, footer }: { heading: string; intro: string; button?: { label: string; href: string }; code?: string; footer: string }): string {
  const buttonHtml = button
    ? `<tr><td style="padding:8px 0 4px;">
        <a href="${button.href}" style="display:inline-block;background:${ACCENT};color:${ACCENT_INK};font-family:${FONT};font-size:16px;font-weight:700;text-decoration:none;padding:13px 22px;border-radius:8px;border-bottom:3px solid #1aa9b0;">${button.label}</a>
      </td></tr>`
    : "";
  const codeHtml = code
    ? `<tr><td style="padding:${button ? "20px" : "8px"} 0 0;font-family:${FONT};font-size:14px;color:${MUTED};">${button ? "Or enter this code in the Method V app:" : "Your code:"}</td></tr>
      <tr><td style="padding:8px 0 0;"><span style="display:inline-block;font-family:'SFMono-Regular',Menlo,Consolas,monospace;font-size:28px;font-weight:700;letter-spacing:6px;color:${INK};background:#eef7f8;border:1px solid #cfe3e6;border-radius:8px;padding:10px 16px;">${code}</span></td></tr>`
    : "";
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#eef2f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f6;">
<tr><td align="center" style="padding:32px 16px;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border-radius:14px;overflow:hidden;">
    <tr><td style="background:${INK};padding:20px 28px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td valign="bottom" style="font-family:Impact,'Arial Black',${FONT};font-size:24px;line-height:24px;font-weight:900;letter-spacing:0.5px;color:#ffffff;">METHOD</td>
        <td width="7" style="width:7px;font-size:0;line-height:0;">&nbsp;</td>
        <td valign="bottom" style="padding-bottom:2px;">${pixelV(3)}</td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px 28px 32px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td style="font-family:${FONT};font-size:24px;font-weight:800;color:${INK};padding:0 0 10px;">${heading}</td></tr>
        <tr><td style="font-family:${FONT};font-size:16px;line-height:1.5;color:#1f2d3b;padding:0 0 18px;">${intro}</td></tr>
        ${buttonHtml}
        ${codeHtml}
        <tr><td style="font-family:${FONT};font-size:13px;line-height:1.5;color:${MUTED};padding:28px 0 0;">${footer}</td></tr>
      </table>
    </td></tr>
  </table>
  <p style="font-family:${FONT};font-size:12px;color:${MUTED};margin:16px 0 0;">Method V · Real apps. Real builders. Real feedback.</p>
</td></tr>
</table>
</body>
</html>`;
}

const IGNORE = "If you didn't ask for this, you can ignore this email.";

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  {
    supabaseName: "Confirm sign up",
    subject: "Confirm your Method V account",
    html: layout({
      heading: "Welcome to Method V",
      intro: "Confirm your email to finish signing up, then post your first Drop, follow builders and test apps.",
      button: { label: "Confirm my email", href: "{{ .ConfirmationURL }}" },
      code: "{{ .Token }}",
      footer: `If you didn't sign up for Method V, you can ignore this email.`,
    }),
  },
  {
    supabaseName: "Magic link",
    subject: "Your Method V sign-in link",
    html: layout({
      heading: "Sign in to Method V",
      intro: "Tap the button to sign in. It also works if you forgot your password: you can set a new one under Edit profile.",
      button: { label: "Sign in", href: "{{ .ConfirmationURL }}" },
      code: "{{ .Token }}",
      footer: `The link and code work once and expire soon. ${IGNORE}`,
    }),
  },
  {
    supabaseName: "Reset password",
    subject: "Reset your Method V password",
    html: layout({
      heading: "Reset your password",
      intro: "Tap the button to sign in, then choose a new password under Edit profile.",
      button: { label: "Reset my password", href: "{{ .ConfirmationURL }}" },
      footer: IGNORE,
    }),
  },
  {
    supabaseName: "Change email address",
    subject: "Confirm your new email for Method V",
    html: layout({
      heading: "Confirm your new email",
      intro: "Confirm changing your Method V email from {{ .Email }} to {{ .NewEmail }}.",
      button: { label: "Confirm new email", href: "{{ .ConfirmationURL }}" },
      footer: `If you didn't ask to change your email, don't tap the button, and change your password.`,
    }),
  },
  {
    supabaseName: "Invite user",
    subject: "You're invited to Method V",
    html: layout({
      heading: "You're invited to Method V",
      intro: "Method V is where builders and vibe coders show off what they made and get real feedback. Tap the button to join.",
      button: { label: "Accept the invite", href: "{{ .ConfirmationURL }}" },
      footer: IGNORE,
    }),
  },
  {
    supabaseName: "Reauthentication",
    subject: "Your Method V verification code",
    html: layout({
      heading: "Confirm it's you",
      intro: "Enter this code to finish what you started on Method V.",
      code: "{{ .Token }}",
      footer: IGNORE,
    }),
  },
];
