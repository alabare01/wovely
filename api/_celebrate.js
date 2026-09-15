// The office hears it. Adam, 2026-09-15: "i want celebrations on alexa devices
// for every new pattern uploaded into wovely.app, including Dani. Same for new
// members. Same for paying customers. and my office set up of course."
//
// This file is the only place the app talks to Marvin. It posts one small JSON
// body to the comms server behind comms.gognome.io, which verifies the shared
// secret and hands the event to celebrate.mjs (lights, the office speaker,
// every Echo in the house, the phone). Nothing here can ever block or fail the
// caller: a celebration that broke a Stripe webhook would trade a real sale
// for a noise, so every path returns a result object and never throws.
//
// Never for the probe user or any synthetic path. The caller decides that (it
// already knows the user); this file only refuses an obviously synthetic
// display name so a slip upstream still cannot reach the speakers.
//
// Helper, not a function: the underscore keeps it out of the deployed count.

const ENDPOINT = process.env.WOVELY_CELEBRATE_URL || 'https://comms.gognome.io/celebrate';
const SYNTHETIC = /probe|synthetic|qc-|playwright|test@|wovely\.app$/i;

export async function celebrate({ kind, what, who, amount, id, synthetic = false, dry = false }) {
  const secret = process.env.WOVELY_CELEBRATE_SECRET;
  if (!secret) return { ok: false, why: 'WOVELY_CELEBRATE_SECRET not set' };
  if (!['pattern', 'member', 'sale'].includes(kind)) return { ok: false, why: 'unknown kind ' + kind };
  if (synthetic || SYNTHETIC.test(String(who || ''))) { console.log('[celebrate]', kind, 'skipped: synthetic'); return { ok: false, why: 'synthetic, not celebrated' }; }
  const body = {
    kind,
    what: String(what || '').slice(0, 120),
    who: String(who || 'a member').slice(0, 60),
    amount: typeof amount === 'number' && isFinite(amount) ? amount : undefined,
    id: id ? String(id).slice(0, 80) : undefined,
    lane: 'Wovely',
    dry: dry === true || undefined,
  };
  try {
    const r = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-wovely-secret': secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    const text = await r.text().catch(() => '');
    if (!r.ok) { console.warn('[celebrate]', kind, 'refused', r.status, text.slice(0, 120)); return { ok: false, why: 'http ' + r.status }; }
    console.log('[celebrate]', kind, body.what || body.who, 'sent');
    return { ok: true };
  } catch (e) {
    console.warn('[celebrate]', kind, 'not delivered:', String(e && e.message || e).slice(0, 120));
    return { ok: false, why: String(e && e.message || e).slice(0, 120) };
  }
}
