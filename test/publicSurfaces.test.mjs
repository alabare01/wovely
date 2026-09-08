// The surfaces a stranger sees before they are anybody.
//
// WHY THIS FILE EXISTS
// A real-browser audit of production on 2026-09-08 found four faults that a
// passing build and a green suite had no opinion about, because all four were
// about what the page SAYS rather than whether it renders:
//
//   · a shared pattern link showed a signed-out stranger a blank dashboard
//     belonging to nobody, headed "Welcome back. Your Wovely is ready";
//   · /privacy and /terms had literally zero anchors on the page, and their
//     one control was navigate(-1), which from a Google result went back to
//     google.com;
//   · the app shell carried "Welcome back" and "Welcome to Wovely" in the DOM
//     at the same time, on the same page, to the same first-time visitor;
//   · nineteen em dashes on the landing page, against a house rule that bans
//     them, on the single highest-traffic outward surface on the domain.
//
// Source-level assertions: App.jsx and the screens are JSX and node --test
// cannot import them without a transform. Same technique as
// test/firstRun.test.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

const APP = read('../src/App.jsx');
const AUTH = read('../src/Auth.jsx');
const GATE = read('../src/SharedLinkGate.jsx');
const PRIVACY = read('../src/PrivacyPolicy.jsx');
const TERMS = read('../src/TermsOfService.jsx');
const LEGALNAV = read('../src/components/LegalPageNav.jsx');

// Comments are stripped by the build and never reach a browser, so the house
// writing rules are checked against the code that actually ships.
const shipped = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').filter(l => !l.trimStart().startsWith('//')).join('\n');

// ── 1. A shared link is not a blank dashboard ────────────────────────────────

test('shared link: a cold visitor on /pattern/:id gets a real answer', () => {
  assert.match(APP, /!authed&&!anonymousMode&&\(location\.pathname\.startsWith\("\/pattern\/"\)/,
    'signed-out deep links must be intercepted before the app shell renders');
  for (const p of ['/hive/', '/collections/']) {
    assert.ok(APP.includes(`!authed&&!anonymousMode&&(location.pathname.startsWith("/pattern/")||location.pathname.startsWith("/hive/")||location.pathname.startsWith("/collections/"))`),
      `${p} must be covered by the same gate`);
  }
  assert.match(APP, /<SharedLinkGate/, 'the gate screen must actually be rendered');
});

test('shared link: an anonymous guest keeps the old fall-through', () => {
  // A guest in anonymous mode has their own local patterns living on these
  // paths. Gating on !authed alone would lock them out of their own work.
  assert.match(APP, /!authed&&!anonymousMode&&\(location\.pathname\.startsWith/,
    'the gate must require BOTH no session and no guest mode');
});

test('shared link: the gate offers a way in and a way on', () => {
  assert.match(GATE, /Sign in to view it/);
  assert.match(GATE, /Start free/);
  assert.match(APP, /onSignIn=\{\(\)=>navigate\(\{pathname:"\/",hash:"#signin"\}\)\}/,
    'signing in must land on the sign-in card, not the marketing hero');
  assert.match(AUTH, /if \(h === "#signin"\)|h === "#signup" \|\| h === "#signin"/,
    'Auth must honour the #signin hash the gate sends it to');
});

test('shared link: where they were going is remembered', () => {
  // Otherwise signing in drops them on the dashboard and the shared pattern,
  // the entire reason they clicked, is never seen.
  const block = APP.slice(APP.indexOf('const sharedKind'), APP.indexOf('<SharedLinkGate'));
  assert.match(block, /wovely_redirect_intent/,
    'the gate must stash the redirect intent so sign-in returns to the shared pattern');
  assert.match(block, /replace\("\/hive\/","\/pattern\/"\)/,
    'legacy /hive/ links must be normalised the way handleSignIn expects');
});

test('shared link: existence is never probed for a signed-out visitor', () => {
  // RLS hides a real private pattern and a made-up id identically. A screen
  // that could tell them apart would be an oracle for enumerating other
  // people's pattern ids.
  const block = APP.slice(APP.indexOf('const sharedKind'), APP.indexOf('<SharedLinkGate'));
  assert.equal(/fetch\(/.test(block), false,
    'the signed-out gate must not query Supabase to decide what to say');
});

test('shared link: a signed-in dead link says so instead of bouncing', () => {
  assert.match(APP, /setDeepLinkNotFound\("pattern"\)/,
    'a fetched-and-empty pattern deep link must report not-found, not navigate away');
  assert.match(APP, /setDeepLinkNotFound\("collection"\)/,
    'same for collections');
  assert.match(APP, /useEffect\(\(\)=>\{ setDeepLinkNotFound\(null\); \},\[location\.pathname\]\)/,
    'the not-found screen must not outlive the URL that produced it');
  assert.match(GATE, /That \$\{noun\} is not here/);
});

// ── 2. The legal pages are not cul-de-sacs ───────────────────────────────────

test('legal: the footer controls are real anchors', () => {
  // They were <span onClick>, so not crawlable, not middle-clickable, and not
  // announced to a screen reader as links.
  assert.equal(/<span onClick=\{\(\)=>legalNav\("\/privacy"\)\}/.test(APP), false,
    'the legal footer still uses a span for Privacy Policy');
  assert.equal(/<span onClick=\{\(\)=>profileNav\("\/privacy"\)\}/.test(APP), false,
    'the profile legal footer still uses a span for Privacy Policy');
  // Two footers carry these: the public legal footer and the profile screen.
  assert.equal((APP.match(/<a href="\/privacy"/g) || []).length, 2,
    'both legal footers must link Privacy Policy as an anchor');
  assert.equal((APP.match(/<a href="\/terms"/g) || []).length, 2,
    'both legal footers must link Terms of Service as an anchor');
  assert.match(APP, /<a href="\/privacy"[\s\S]{0,400}?>Privacy Policy<\/a>/);
  assert.match(APP, /<a href="\/terms"[\s\S]{0,400}?>Terms of Service<\/a>/);
});

test('legal: the client router still handles an ordinary click', () => {
  // A real href that triggers a full page reload would throw away the SPA
  // state on every legal-link click.
  assert.match(APP, /const go=\(e,path\)=>\{[\s\S]{0,240}e\.preventDefault\(\);[\s\S]{0,60}legalNav\(path\);/,
    'the anchor must preventDefault and navigate in-router');
  assert.match(APP, /e\.metaKey\|\|e\.ctrlKey\|\|e\.shiftKey\|\|e\.altKey/,
    'a modified click must be left to the browser so "open in new tab" works');
});

test('legal: navigate(-1) is gone from both pages', () => {
  // Verified live: arriving from Google and clicking "← Back" went to
  // google.com. A history pop is not a route.
  for (const [name, src] of [['PrivacyPolicy.jsx', PRIVACY], ['TermsOfService.jsx', TERMS]]) {
    assert.equal(/navigate\(-1\)/.test(src), false, `${name} still ejects the visitor with navigate(-1)`);
    assert.match(src, /<LegalTopNav \/>/, `${name} must have a real route back into the product`);
    assert.match(src, /<LegalBottomNav other="/, `${name} must have onward links at the foot`);
  }
});

test('legal: the pages now carry real routes onward', () => {
  assert.match(LEGALNAV, /href="\/"[\s\S]{0,120}Back to Wovely/, 'a route home, not a history pop');
  assert.match(LEGALNAV, /href="\/tools"/, 'an onward route into something useful');
  assert.match(LEGALNAV, /href="mailto:bev@wovely\.app"/);
  // Both pages link to each other, so neither is a leaf.
  assert.match(PRIVACY, /other="terms"/);
  assert.match(TERMS, /other="privacy"/);
});

// ── 3. One greeting at a time, and the right one ─────────────────────────────

test('welcome: neither greeting is in the DOM when it has nothing to say', () => {
  // Both used to render always and hide with opacity, so a page carried
  // "Welcome back" and "Welcome to Wovely" simultaneously, to everyone,
  // including the shell a signed-out stranger was handed.
  assert.match(APP, /const WelcomeToast = \(\{visible, returning = true\}\) => \{\s*if \(!visible\) return null;/,
    'WelcomeToast must not mount when it is not visible');
  assert.match(APP, /const WelcomeBanner = \(\{visible\}\) => \{\s*if \(!visible\) return null;/,
    'WelcomeBanner must not mount when it is not visible');
});

test('welcome: "Welcome back" is only said to someone who has been here', () => {
  assert.match(APP, /returning \? "Welcome back\. Your Wovely is ready\." : "Welcome to Wovely\. Your space is ready\."/,
    'the greeting must branch on whether this is a returning visitor');
  assert.match(APP, /<WelcomeToast visible=\{showWelcomeToast\} returning=\{welcomeIsReturning\}\/>/,
    'the toast must be told which greeting to use');
  assert.match(APP, /setWelcomeIsReturning\(true\);\s*\n\s*setShowWelcomeToast\(true\)/,
    'the sign-in path must set the returning flag alongside the toast');
});

test('welcome: the mobile banner is passed the prop it actually reads', () => {
  // It was handed onDismiss, which WelcomeBanner does not take, so on mobile
  // it rendered permanently invisible.
  assert.equal(/<WelcomeBanner onDismiss=/.test(APP), false,
    'WelcomeBanner is still being passed a prop it does not read');
  assert.match(APP, /\{showWelcomeBanner&&<WelcomeBanner visible=\{showWelcomeBanner\}\/>\}/);
});

test('welcome: the yarn ball stays', () => {
  // Bev is a crocheted snake and she is in the hero photo. The emoji is
  // deliberate and is not an AI tell.
  assert.match(APP, /<span style=\{\{fontSize:18\}\}>🧶<\/span>/);
});

// ── 4. House writing rules on the highest-traffic outward surface ────────────

test('landing: no em dashes anywhere in the shipped landing page', () => {
  // curl https://wovely.app/ | grep -c "—" returned 19 on 2026-09-08. Every
  // other page on the domain was clean, so the worst offender was the one page
  // most people see. Four of the nineteen were inside CSS comments in the
  // <style> block, which ship to the browser like everything else.
  const code = shipped(AUTH);
  const hits = (code.match(/—/g) || []).length;
  assert.equal(hits, 0, `${hits} em dash(es) still ship in Auth.jsx`);
});

test('landing: no exclamation points in outward copy', () => {
  const code = shipped(AUTH);
  // A letter immediately before "!" is prose; "!=" and "!x" are code.
  const prose = code.match(/[A-Za-z,)]!/g) || [];
  assert.deepEqual(prose, [], `exclamation points in landing copy: ${prose.join(' ')}`);
});

test('landing: the statistics claims are untouched', () => {
  // Positioning is a separate question, being put to Adam directly. This test
  // exists so a later copy pass cannot quietly move the numbers while tidying
  // the punctuation around them. The big numbers are split across a value span
  // and a unit span in the markup, so each is asserted in the shape it ships.
  const claims = [
    ['+4 hrs', /<div className="statn">\+4<span className="statu">hrs<\/span><\/div>/],
    ['60%', /<div className="statn">60<span className="statu">%<\/span><\/div>/],
    ['1,000+', /<div className="statn">1,000<span className="statu">\+<\/span><\/div>/],
    ['99.7% certified', /99\.7% certified/],
  ];
  for (const [name, re] of claims) {
    assert.match(AUTH, re, `the landing statistic "${name}" went missing or changed`);
  }
  // The sentences that carry them, too.
  assert.ok(AUTH.includes('Organized ones get 6.5.'), 'the found-hours claim changed');
  assert.ok(AUTH.includes('Bev knows yours to the skein'), 'the yarn-budget claim changed');
});
