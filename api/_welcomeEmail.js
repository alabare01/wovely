// api/_welcomeEmail.js
// The one welcome message a new Wovely account gets. Copy lives here, in one
// place, so it can be read and ruled on without reading a handler.
//
// It does three things and nothing else:
//   1. confirms the account exists
//   2. puts them one click from their first pattern
//   3. tells them how to reach a human
//
// House rules this copy is held to, checked by test/welcomeEmail.test.mjs:
//   no em dashes, no exclamation points, no claim that the tool is the hero,
//   and the price stated in full rather than "free" left hanging.

import { SITE_ORIGIN } from './_mail.js';

export const WELCOME_SUBJECT = 'Your Wovely account is ready';
export const WELCOME_PREVIEW = 'Put one pattern in and see if it holds up.';

// Free tier is 5 patterns. Craft is $6.99/mo or $54.99/yr. Both figures match
// src/App.jsx TIERS.craft and the Terms page. If pricing moves, this moves.
const PRICE_LINE =
  'On the free plan you can keep 5 patterns, track your place row by row, and see the stitch counts checked before you start. No card. If you outgrow 5, Craft is $6.99 a month or $54.99 a year. That is the whole price list.';

const BODY_LINES = [
  'Your Wovely account is set up and ready to use.',
  'Adam here. I built Wovely for my wife Dani, who had patterns scattered across screenshots, PDFs and open browser tabs and wanted one place to keep them.',
  'The quickest way to find out whether it works for you is to put one pattern in. A screenshot, a PDF, or a link you have been meaning to save.',
];

const CLOSING_LINES = [
  PRICE_LINE,
  'If something breaks, or you get stuck, or a screen does not make sense, reply to this message. It comes to my inbox and I answer it myself.',
];

const FOOTER_TEXT = 'You are receiving this because you created a Wovely account.';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * @param {object} opts
 * @param {string} [opts.ctaUrl]        where the button goes. A one-click sign-in
 *                                      link when we could mint one, otherwise the site.
 * @param {string|null} [opts.unsubUrl] signed unsubscribe URL, or null.
 * @returns {{subject:string, html:string, text:string}}
 */
export function buildWelcomeEmail({ ctaUrl = SITE_ORIGIN, unsubUrl = null } = {}) {
  const cta = ctaUrl || SITE_ORIGIN;

  const text = [
    'Hi,',
    '',
    BODY_LINES[0],
    '',
    BODY_LINES[1],
    '',
    BODY_LINES[2],
    '',
    `Open Wovely: ${cta}`,
    '',
    CLOSING_LINES[0],
    '',
    CLOSING_LINES[1],
    '',
    'Adam',
    'wovely.app',
    '',
    FOOTER_TEXT,
    unsubUrl
      ? `To stop receiving email from Wovely: ${unsubUrl}`
      : 'To stop receiving email from Wovely, reply and say so.',
    '',
  ].join('\n');

  const footerLink = unsubUrl
    ? `<a href="${esc(unsubUrl)}" style="color:#8a8a9a; text-decoration:underline;">Unsubscribe</a>`
    : `<a href="mailto:adam@wovely.app?subject=unsubscribe" style="color:#8a8a9a; text-decoration:underline;">Unsubscribe</a>`;

  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wovely</title>
</head>
<body style="margin:0; padding:0; background-color:#f8f6f2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color:#2D3A7C;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">${esc(WELCOME_PREVIEW)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8f6f2;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px; background-color:#ffffff; border-radius:16px; box-shadow: 0 2px 12px rgba(45, 58, 124, 0.06); overflow:hidden;">
          <tr>
            <td align="center" style="padding: 40px 40px 20px 40px;">
              <img src="https://wovely.app/bev_neutral.png" width="140" height="140" alt="Bev" style="display:block; width:140px; height:140px; border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 8px 40px; text-align:center;">
              <h1 style="margin:0; font-family: Georgia, 'Times New Roman', serif; font-size:27px; line-height:1.25; color:#2D3A7C; font-weight:600;">Your Wovely account is ready</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 0 40px; font-size:16px; line-height:1.65; color:#3a3a4a;">
              <p style="margin: 0 0 16px 0;">Hi,</p>
              <p style="margin: 0 0 16px 0;">${esc(BODY_LINES[0])}</p>
              <p style="margin: 0 0 16px 0;">${esc(BODY_LINES[1])}</p>
              <p style="margin: 0 0 16px 0;">${esc(BODY_LINES[2])}</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 20px 40px 8px 40px;">
              <a href="${esc(cta)}" style="display:inline-block; background-color:#9B7EC8; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; padding:16px 32px; border-radius:999px; box-shadow: 0 2px 8px rgba(155, 126, 200, 0.3);">Open Wovely</a>
            </td>
          </tr>
          <tr>
            <td style="padding: 16px 40px 0 40px; font-size:16px; line-height:1.65; color:#3a3a4a;">
              <p style="margin: 0 0 16px 0;">${esc(CLOSING_LINES[0])}</p>
              <p style="margin: 0 0 16px 0;">${esc(CLOSING_LINES[1])}</p>
              <p style="margin: 24px 0 8px 0;">Adam<br><a href="https://wovely.app" style="color:#9B7EC8; text-decoration:none;">wovely.app</a></p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 8px 40px 32px 40px; border-top:1px solid #eee8f5;">
              <p style="margin: 24px 0 0 0; font-size:12px; color:#a0a0b0; line-height:1.5;">${esc(FOOTER_TEXT)}<br>${footerLink}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject: WELCOME_SUBJECT, html, text };
}
