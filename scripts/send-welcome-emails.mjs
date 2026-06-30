#!/usr/bin/env node
// One-off welcome-email blast for 13 users, segmented, with per-user Supabase magic links.
// Three modes: --dry-run, --test=<email>, --send. Self-deletes after successful --send.
// Never commit this file. See /scripts/ in .gitignore.

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..");

// ─── Load .env.local (no dotenv dep) ─────────────────────────────────────────
const envPath = path.join(REPO_ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const raw of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let [, k, v] = m;
    v = v.trim().replace(/^["']|["']$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

// ─── Required env ────────────────────────────────────────────────────────────
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
if (!SERVICE_ROLE) { console.error("Missing env: SUPABASE_SERVICE_ROLE_KEY"); process.exit(1); }
if (!RESEND_KEY)   { console.error("Missing env: RESEND_API_KEY"); process.exit(1); }

const SUPABASE_URL = "https://vbtsdyxvqqwxjzpuseaf.supabase.co";
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Recipients & copy ───────────────────────────────────────────────────────
const RECIPIENTS = [
  { segment: "pre_launch_engaged", email: "ronsrit@hotmail.com" },
  { segment: "pre_launch_engaged", email: "steffaniembrown@gmail.com" },
  { segment: "pre_launch_engaged", email: "turttlesong@yahoo.com" },
  { segment: "pre_launch_engaged", email: "andersonkerrie70@gmail.com" },
  { segment: "pre_launch_dormant", email: "tbrightjax@gmail.com" },
  { segment: "pre_launch_dormant", email: "stinkyswife@gmail.com" },
  { segment: "facebook_today",     email: "fionaprevett@icloud.com" },
  { segment: "facebook_today",     email: "nancycasso@gmail.com" },
  { segment: "facebook_today",     email: "andersonchrisp@gmail.com" },
  { segment: "facebook_today",     email: "shelby.feinberg@gmail.com" },
  { segment: "facebook_today",     email: "mallory@transitionsbehaviorservices.com" },
  { segment: "facebook_today",     email: "mackay.amanda@gmail.com" },
  { segment: "facebook_today",     email: "tjwinger75@gmail.com" },
];

const SUBJECTS = {
  pre_launch_engaged: "A quick thank-you and a big update from Wovely",
  pre_launch_dormant: "Remember Wovely? It\u2019s dramatically easier now.",
  facebook_today:     "Thanks for signing up to Wovely today",
};

const PREVIEW_TEXT = {
  pre_launch_engaged: "Your patterns are waiting. So is Bev.",
  pre_launch_dormant: "One click back in, no password needed.",
  facebook_today:     "One click back in, no password needed.",
};

// ─── Templates ───────────────────────────────────────────────────────────────
const HTML_TEMPLATE = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Wovely</title>
</head>
<body style="margin:0; padding:0; background-color:#f8f6f2; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; color:#2D3A7C;">
  <div style="display:none; max-height:0; overflow:hidden; opacity:0;">{{PREVIEW_TEXT}}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8f6f2;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px; background-color:#ffffff; border-radius:16px; box-shadow: 0 2px 12px rgba(45, 58, 124, 0.06); overflow:hidden;">
          <tr>
            <td align="center" style="padding: 40px 40px 24px 40px;">
              <img src="https://wovely.app/bev_neutral.png" width="160" height="160" alt="Bev the lavender snake" style="display:block; width:160px; height:160px; border:0;">
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 8px 40px; text-align:center;">
              <h1 style="margin:0; font-family: Georgia, 'Times New Roman', serif; font-size:28px; line-height:1.25; color:#2D3A7C; font-weight:600;">Welcome back to Wovely</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 24px 40px 0 40px; font-size:16px; line-height:1.65; color:#3a3a4a;">
              <p style="margin: 0 0 16px 0;">Hi,</p>
              <p style="margin: 0 0 16px 0;">Adam here. I'm the guy who built Wovely. My wife Dani is the reason it exists. She was drowning in crochet patterns and needed somewhere better than her phone's screenshot folder, so I built it.</p>
              <p style="margin: 0 0 16px 0;"><strong style="color:#2D3A7C;">A lot has changed since you signed up.</strong> Signup is smoother. You can explore the whole app without even creating an account now. Everything's a little more polished. If you had trouble getting in before, it should be much easier this time.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 28px 40px 12px 40px;">
              <a href="{{MAGIC_LINK}}" style="display:inline-block; background-color:#9B7EC8; color:#ffffff; text-decoration:none; font-size:16px; font-weight:600; padding:16px 32px; border-radius:999px; box-shadow: 0 2px 8px rgba(155, 126, 200, 0.3);">Open My Wovely &rarr;</a>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 0 40px 24px 40px;">
              <p style="margin:0; font-size:13px; color:#8a8a9a; font-style:italic;">One click. No password. Drops you right into your library.</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 40px 0 40px; font-size:16px; line-height:1.65; color:#3a3a4a;">
              <h2 style="margin: 16px 0 12px 0; font-family: Georgia, 'Times New Roman', serif; font-size:20px; color:#2D3A7C; font-weight:600;">While you're there</h2>
              <p style="margin: 0 0 16px 0;">Upload <strong>one pattern</strong> that's been living on your phone as a screenshot, a PDF, or a link you've been meaning to save. Let Bev hold onto it for you. That's the whole point of this place. Your patterns in one calm corner of the internet, organized the way <em>you</em> think about them.</p>
              <p style="margin: 0 0 16px 0;">If you hit anything Pro-locked and want to try it, just reply to this email and I'll flip it on. Genuinely free to ask.</p>
              <h2 style="margin: 24px 0 12px 0; font-family: Georgia, 'Times New Roman', serif; font-size:20px; color:#2D3A7C; font-weight:600;">One more thing</h2>
              <p style="margin: 0 0 16px 0;"><strong style="color:#2D3A7C;">Wovely now lets anyone browse without signing up.</strong> If you have a crochet friend who hates creating accounts just to look around, send them to <a href="https://wovely.app" style="color:#9B7EC8; text-decoration:none; font-weight:600;">wovely.app</a>. They can walk through the whole app first, create a spot later.</p>
              <p style="margin: 0 0 16px 0;">Tell me what you think. Good, bad, or "Adam, this button is broken." I want all of it.</p>
              <p style="margin: 24px 0 8px 0;">&mdash; Adam<br><a href="https://wovely.app" style="color:#9B7EC8; text-decoration:none;">wovely.app</a></p>
              <p style="margin: 20px 0 32px 0; font-size:14px; color:#8a8a9a; font-style:italic;">P.S. Dani has veto power over every design decision. If something looks nice, that's her. If something's clunky, that's me shipping it before she saw it.</p>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding: 0 40px 32px 40px; border-top:1px solid #eee8f5;">
              <p style="margin: 24px 0 0 0; font-size:12px; color:#a0a0b0; line-height:1.5;">You're receiving this because you created a Wovely account. If you'd rather not hear from us again, just reply and say so.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

const TEXT_TEMPLATE = `Hi,

Adam here. I'm the guy who built Wovely. My wife Dani is the reason it exists. She was drowning in crochet patterns and needed somewhere better than her phone's screenshot folder, so I built it.

A lot has changed since you signed up. Signup is smoother. You can explore the whole app without even creating an account now. Everything's a little more polished. If you had trouble getting in before, it should be much easier this time.

Open My Wovely: {{MAGIC_LINK}}

(One click. No password. Drops you right into your library.)

While you're there, upload one pattern that's been living on your phone as a screenshot, a PDF, or a link you've been meaning to save. Let Bev hold onto it for you. That's the whole point of this place.

If you hit anything Pro-locked and want to try it, just reply and I'll flip it on. Genuinely free to ask.

One more thing: Wovely now lets anyone browse without signing up. If you have a crochet friend who hates creating accounts just to look around, send them to wovely.app.

Tell me what you think. Good, bad, or "Adam, this button is broken." I want all of it.

\u2014 Adam
wovely.app

P.S. Dani has veto power over every design decision. If something looks nice, that's her. If something's clunky, that's me shipping it before she saw it.
`;

function renderHtml(magicLink, previewText) {
  return HTML_TEMPLATE
    .replaceAll("{{MAGIC_LINK}}", magicLink)
    .replaceAll("{{PREVIEW_TEXT}}", previewText);
}
function renderText(magicLink) {
  return TEXT_TEMPLATE.replaceAll("{{MAGIC_LINK}}", magicLink);
}

// ─── Supabase magic link (real) ──────────────────────────────────────────────
async function generateMagicLink(email) {
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "magiclink",
    email,
    options: { redirectTo: "https://wovely.app/" },
  });
  if (error) throw new Error(error.message || "generateLink failed");
  const link = data?.properties?.action_link;
  if (!link) throw new Error("generateLink returned no action_link");
  return link;
}

// ─── Resend send ─────────────────────────────────────────────────────────────
async function sendEmail({ to, subject, html, text }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Adam from Wovely <adam@wovely.app>",
      to: [to],
      subject,
      html,
      text,
      reply_to: "adam@wovely.app",
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body.message || body.error || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return body;
}

// ─── Utilities ───────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function groupBySegment() {
  const groups = {};
  for (const r of RECIPIENTS) (groups[r.segment] ||= []).push(r.email);
  return groups;
}

function printRecipientSummary() {
  const groups = groupBySegment();
  console.log("\nRecipients by segment:");
  for (const [seg, emails] of Object.entries(groups)) {
    console.log(`  ${seg} (${emails.length})`);
    for (const e of emails) console.log(`    - ${e}`);
  }
}

function printSubjects() {
  console.log("\nSubject lines by segment:");
  for (const [seg, subj] of Object.entries(SUBJECTS)) {
    console.log(`  ${seg}: ${subj}`);
  }
}

function usage() {
  console.log(`Usage:
  node scripts/send-welcome-emails.mjs --dry-run
  node scripts/send-welcome-emails.mjs --test=your@email.com
  node scripts/send-welcome-emails.mjs --send`);
}

// ─── Modes ───────────────────────────────────────────────────────────────────
async function modeDryRun() {
  const seg = "pre_launch_engaged";
  const html = renderHtml("https://wovely.app/#MAGIC_LINK_PLACEHOLDER", PREVIEW_TEXT[seg]);
  const outPath = path.join(__dirname, "preview.html");
  fs.writeFileSync(outPath, html, "utf8");
  console.log(`Preview written to scripts/preview.html — open in browser to review`);
  console.log(`  (${fs.statSync(outPath).size} bytes at ${outPath})`);
  printSubjects();
  printRecipientSummary();
}

async function modeTest(testEmail) {
  const seg = "pre_launch_engaged";
  console.log(`Sending TEST email to ${testEmail} (segment: ${seg})`);
  console.log(`Generating magic link…`);
  const link = await generateMagicLink(testEmail);
  console.log(`  action_link: ${link.slice(0, 80)}…`);
  const html = renderHtml(link, PREVIEW_TEXT[seg]);
  const text = renderText(link);
  const subject = `[TEST] ${SUBJECTS[seg]}`;
  console.log(`Sending via Resend…`);
  const result = await sendEmail({ to: testEmail, subject, html, text });
  console.log(`  sent | id: ${result.id || "(no id)"}`);
  console.log(`Full response:\n${JSON.stringify(result, null, 2)}`);
}

function promptYes(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function modeSend() {
  console.log("=== SEND MODE ===");
  printSubjects();
  printRecipientSummary();
  const ans = await promptYes(`\nSend to all ${RECIPIENTS.length}? Type YES to confirm: `);
  if (ans !== "YES") {
    console.log("Aborted (did not receive exact 'YES').");
    return false;
  }
  console.log("\nSending…\n");
  let sent = 0, failed = 0;
  for (const r of RECIPIENTS) {
    try {
      const link = await generateMagicLink(r.email);
      const html = renderHtml(link, PREVIEW_TEXT[r.segment]);
      const text = renderText(link);
      const result = await sendEmail({ to: r.email, subject: SUBJECTS[r.segment], html, text });
      const id = result.id || "(no id)";
      console.log(`[${r.segment}] ${r.email} → sent | id: ${id}`);
      sent++;
    } catch (e) {
      console.log(`[${r.segment}] ${r.email} → FAILED: ${e.message}`);
      failed++;
    }
    await sleep(500);
  }
  console.log(`\nFinal: ${sent} sent, ${failed} failed.`);
  return failed === 0;
}

// ─── Entry ───────────────────────────────────────────────────────────────────
async function main() {
  const arg = process.argv[2] || "";
  if (arg === "--dry-run") {
    await modeDryRun();
    return;
  }
  if (arg.startsWith("--test=")) {
    const email = arg.slice("--test=".length).trim();
    if (!email || !email.includes("@")) { console.error("Invalid --test email."); process.exit(1); }
    await modeTest(email);
    return;
  }
  if (arg === "--send") {
    const ok = await modeSend();
    if (ok) {
      try {
        fs.unlinkSync(__filename);
        console.log(`\nScript self-deleted: ${__filename}`);
      } catch (e) {
        console.warn(`\nSelf-delete failed: ${e.message}`);
      }
    }
    return;
  }
  usage();
}

main().catch((e) => {
  console.error("Error:", e.message || e);
  process.exit(1);
});
