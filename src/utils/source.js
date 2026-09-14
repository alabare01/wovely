// Where a person came from, kept until they tell us who they are.
//
// Every outward Wovely link carries ?s=<channel> (the WOVELY desk's
// wovely-links.json). The first value seen in a tab's lifetime is kept in
// localStorage so it survives the demo, the guest pattern and a signup, and
// rides along as signup_source on the auth user's metadata. First touch wins:
// a later visit through a different link does not overwrite it.
//
// No table, no schema. The read side is scripts/waitlist-read.mjs.

const KEY = 'wovely_source';
const PATTERN = /^[a-z0-9_-]{1,40}$/i;

export function captureSource(search) {
  try {
    const q = new URLSearchParams(search ?? window.location.search);
    const s = (q.get('s') || q.get('utm_source') || '').trim();
    if (!s || !PATTERN.test(s)) return getSource();
    if (localStorage.getItem(KEY)) return getSource();
    localStorage.setItem(KEY, s.toLowerCase());
    return s.toLowerCase();
  } catch {
    return null;
  }
}

export function getSource() {
  try {
    const v = localStorage.getItem(KEY);
    return v && PATTERN.test(v) ? v : null;
  } catch {
    return null;
  }
}
