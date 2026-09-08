// src/utils/pulse.js
// The browser half of the live monitor. Tells /api/pulse that something
// happened, so Adam can tell whether anyone is on his site without asking.
//
// WHAT LEAVES THE BROWSER, in full, with nothing omitted:
//   kind  — one of the fixed names in api/_monitor.js EVENT_KINDS
//   path  — window.location.pathname. No query string, no hash.
//   ref   — the REFERRING HOSTNAME only, never the referring URL.
//   sid   — 16 random hex characters, generated per tab, held in
//           sessionStorage, gone when the tab closes. It exists so two events
//           can be recognised as the same visit. It is not an identity and it
//           does not survive the session.
//   uid   — the Supabase user id, when there is one. Already in our database.
//   meta  — a handful of small scalars, capped at 80 characters each on the
//           server.
//
// WHAT NEVER LEAVES: user agent, IP, screen size, query strings, referring
// paths, email addresses, and above all one single character of anybody's
// pattern. The public tool pages promise a pasted pattern does not leave the
// browser, and this file is not allowed to be the reason that stops being true.
//
// It is fire-and-forget in every sense: sendBeacon where available, a keepalive
// fetch otherwise, all failures swallowed. Nothing here can slow down or break
// a page.

const ENDPOINT = '/api/pulse';
const SID_KEY = 'wovely_pulse_sid';
const ARRIVED_KEY = 'wovely_pulse_arrived';

/** Random 16 hex chars. crypto where available, Math.random as a fallback. */
function newSid() {
  try {
    const b = new Uint8Array(8);
    (window.crypto || window.msCrypto).getRandomValues(b);
    return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  } catch {
    let s = '';
    while (s.length < 16) s += Math.floor(Math.random() * 16).toString(16);
    return s.slice(0, 16);
  }
}

let _sid = null;
function sessionId() {
  if (_sid) return _sid;
  try {
    const found = sessionStorage.getItem(SID_KEY);
    if (found && /^[0-9a-f]{8,32}$/i.test(found)) return (_sid = found);
    const made = newSid();
    sessionStorage.setItem(SID_KEY, made);
    return (_sid = made);
  } catch {
    // Private mode with storage blocked. A per-page-load id still groups the
    // events on one page, which is better than none.
    return (_sid = _sid || newSid());
  }
}

/** The uid, read from the session the app already keeps. Never an email. */
function currentUid() {
  try {
    const raw = localStorage.getItem('yh_session');
    if (!raw) return null;
    const s = JSON.parse(raw);
    const id = s?.user?.id;
    return typeof id === 'string' && id.length === 36 ? id : null;
  } catch {
    return null;
  }
}

/** Referring hostname, and only when it is somewhere other than here. */
function referrerHost() {
  try {
    if (!document.referrer) return null;
    const h = new URL(document.referrer).hostname;
    return h && h !== window.location.hostname ? h : null;
  } catch {
    return null;
  }
}

/**
 * Somewhere a beacon has no business firing: server render, a headless browser
 * (our own prerender and every synthetic checker), and local development,
 * which would otherwise post Adam's own dev clicks into his live monitor.
 */
function shouldSend() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  try {
    if (navigator.webdriver) return false;
    const h = window.location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '' || h.endsWith('.local')) return false;
  } catch {
    return false;
  }
  return true;
}

/**
 * Report one event. Returns nothing and throws nothing, ever.
 * @param {string} kind one of the names in api/_monitor.js EVENT_KINDS
 * @param {object} [meta] small scalars only
 */
export function pulse(kind, meta) {
  if (!shouldSend()) return;
  try {
    const body = JSON.stringify({
      kind,
      path: window.location.pathname,
      ref: referrerHost(),
      sid: sessionId(),
      uid: currentUid(),
      meta: meta && typeof meta === 'object' ? meta : undefined,
    });
    if (navigator.sendBeacon) {
      // application/json is not a CORS-safelisted content type, which would
      // normally make this a preflight sendBeacon cannot perform. /api/pulse is
      // SAME ORIGIN, so no preflight is involved and the platform hands the
      // handler an already-parsed object. api/pulse.js still accepts a raw
      // string and a Buffer, because a beacon that silently posts a shape the
      // server drops is the failure nobody notices.
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(ENDPOINT, blob)) return;
    }
    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* a monitor that can break a page is not a monitor */
  }
}

/**
 * Fired once per tab, at boot. A person who arrives and never signs up is the
 * larger half of this business and used to be completely invisible; this is
 * the event that ends that.
 *
 * Signed-in returns are recorded as `visit`, which digests rather than
 * interrupts. Adam does not need paging when his own wife opens the app.
 */
export function startPulseSession() {
  if (!shouldSend()) return;
  try {
    if (sessionStorage.getItem(ARRIVED_KEY) === '1') return;
    sessionStorage.setItem(ARRIVED_KEY, '1');
  } catch {
    /* storage blocked: one event per page load is an acceptable overcount */
  }
  pulse(currentUid() ? 'visit' : 'guest_arrived');
}
