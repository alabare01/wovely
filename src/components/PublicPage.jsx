// ─── PUBLIC PAGE CHROME ──────────────────────────────────────────────────────
//
// Shared shell for the signed-out, indexable tool pages. These render OUTSIDE
// the app shell on purpose: a stranger arriving from a search result should get
// the tool and nothing else — no sidebar, no session fetch, no auth check, no
// modal. The page has to be useful before it asks for anything, or it is a
// worse search result than the static chart it is trying to beat.
//
// Visual language is Design System 2b as-is (theme.jsx `T`). Nothing new is
// invented here; this file only arranges existing tokens.

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { T, useBreakpoint } from "../theme.jsx";
import { stopReplayForToolPage } from "../utils/analytics.js";

/** The standard 2b card: solid white panel on the woven canvas. */
export const CARD = {
  background: T.panel,
  border: `1px solid ${T.line}`,
  borderRadius: 22,
  boxShadow: T.shadowLg,
};

export const LABEL = {
  fontSize: 11,
  fontWeight: 800,
  color: T.muted,
  textTransform: "uppercase",
  letterSpacing: ".06em",
  fontFamily: T.body,
};

/** Inject a JSON-LD block for the page and clean it up on unmount.
 *
 *  Skips the injection when the build has already written the same block into
 *  the raw HTML head (see scripts/prerender.mjs), so a page loaded directly
 *  from a search result carries exactly one copy. This hook still does the work
 *  on a client-side navigation, where there is no per-route HTML file. */
export function useJsonLd(data) {
  useEffect(() => {
    if (!data) return;
    if (document.head.querySelector('script[data-wovely-jsonld="build"]')) return;
    const el = document.createElement("script");
    el.type = "application/ld+json";
    el.textContent = JSON.stringify(data);
    el.dataset.wovelyJsonld = "1";
    document.head.appendChild(el);
    return () => { el.remove(); };
  }, [JSON.stringify(data)]);
}

const TopBar = () => (
  <div style={{
    position: "sticky", top: 0, zIndex: 20,
    background: "rgba(251,249,255,.86)",
    backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)",
    borderBottom: `1px solid ${T.line}`,
  }}>
    <div style={{
      maxWidth: 1000, margin: "0 auto", padding: "10px 20px",
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <Link to="/" style={{ display: "flex", alignItems: "center", gap: 9, textDecoration: "none" }}>
        <img src="/bev_neutral.png" alt="" width="30" height="30"
          style={{ borderRadius: 9, display: "block" }} />
        <span style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 19, color: T.ink }}>Wovely</span>
      </Link>
      <Link to="/tools" style={{
        marginLeft: "auto", fontFamily: T.body, fontWeight: 700, fontSize: 13,
        color: T.muted, textDecoration: "none",
      }}>More tools</Link>
    </div>
  </div>
);

/** The honest close. Every claim here is a feature that exists in the app, and
 *  nothing on this page is gated behind it. Pages that need a different
 *  argument pass their own `title`, `body` and `cta`. */
export const Closer = ({
  isMobile,
  title = "Once it is converted, you still have to work it",
  body = "That is the part this page cannot help with. Wovely is the app for it: keep your patterns in one place, tick off rows as you go, and open your phone to the row you actually stopped on rather than the one you think you stopped on.",
  cta = "Try Wovely free",
  note = "No account needed to start",
  to = "/",
}) => (
  <div style={{ ...CARD, padding: isMobile ? 22 : 30, marginTop: 34, background: T.soft, borderColor: "#E2DAF6" }}>
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
      <img src="/bev_neutral.png" alt="" width="42" height="42" style={{ borderRadius: 12, display: "block", flexShrink: 0 }} />
      <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: isMobile ? 18 : 20, color: T.ink, lineHeight: 1.25 }}>
        {title}
      </div>
    </div>
    <p style={{ fontFamily: T.body, fontSize: 15, lineHeight: 1.72, color: T.ink, margin: "0 0 14px" }}>
      {body}
    </p>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
      <Link to={to} style={{
        display: "inline-block", padding: "12px 22px", borderRadius: 999,
        background: `linear-gradient(180deg, ${T.accent}, ${T.accentD})`,
        color: "#fff", fontFamily: T.body, fontWeight: 800, fontSize: 15,
        textDecoration: "none", boxShadow: "0 8px 20px -10px rgba(90,66,160,.7)",
      }}>{cta}</Link>
      <span style={{ fontFamily: T.body, fontSize: 13, color: T.muted, fontWeight: 600 }}>
        {note}
      </span>
    </div>
  </div>
);

const OTHER_TOOLS = [
  { to: "/uk-us-crochet-terms", label: "UK to US pattern converter" },
  { to: "/crochet-abbreviations", label: "Crochet abbreviations" },
  { to: "/crochet-stitch-counter", label: "Stitch count checker" },
  { to: "/crochet-gauge-calculator", label: "Gauge calculator" },
  { to: "/yarn-yardage-calculator", label: "Yarn yardage calculator" },
  { to: "/crochet-pattern-scale-calculator", label: "Pattern scale calculator" },
];

const Footer = ({ current }) => (
  <div style={{ borderTop: `1px solid ${T.line}`, marginTop: 40, paddingTop: 26 }}>
    <div style={{ ...LABEL, marginBottom: 12 }}>Other free crochet tools</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 26 }}>
      {OTHER_TOOLS.filter((t) => t.to !== current).map((t) => (
        <Link key={t.to} to={t.to} style={{
          padding: "9px 15px", borderRadius: 999, background: T.panel,
          border: `1px solid ${T.line}`, color: T.accent,
          fontFamily: T.body, fontWeight: 700, fontSize: 13.5, textDecoration: "none",
        }}>{t.label}</Link>
      ))}
    </div>
    <div style={{ fontFamily: T.body, fontSize: 12, color: T.muted, paddingBottom: 40 }}>
      <Link to="/privacy" style={{ color: T.muted }}>Privacy Policy</Link>
      <span style={{ margin: "0 8px", opacity: .5 }}>|</span>
      <Link to="/terms" style={{ color: T.muted }}>Terms of Service</Link>
      <span style={{ margin: "0 8px", opacity: .5 }}>|</span>
      <span>Wovely LLC</span>
    </div>
  </div>
);

/**
 * @param {string} h1        the page's single H1
 * @param {node}   intro     the standfirst under the H1
 * @param {string} path      this page's own path, so it is not linked to itself
 * @param {bool}   showCloser whether to render the Wovely pitch above the footer
 */
export default function PublicPage({ h1, intro, path, children, showCloser = true, closer }) {
  const { isMobile } = useBreakpoint();
  // These pages promise that a pasted pattern stays in the browser. Session
  // replay would break that promise, so it is stopped here as well as at init,
  // which covers a signed-in reader who navigated in without a page load.
  useEffect(() => { stopReplayForToolPage(); }, []);
  return (
    <div style={{ minHeight: "100vh", fontFamily: T.body, color: T.ink }}>
      <TopBar />
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: isMobile ? "26px 18px 0" : "40px 40px 0" }}>
        <h1 style={{
          fontFamily: T.disp, fontWeight: 700,
          fontSize: isMobile ? 30 : 42, lineHeight: 1.12,
          color: T.ink, margin: "0 0 14px", letterSpacing: "-.01em",
        }}>{h1}</h1>
        <div style={{
          fontFamily: T.body, fontSize: isMobile ? 16 : 17.5, lineHeight: 1.68,
          color: T.muted, maxWidth: 720, margin: "0 0 28px", fontWeight: 500,
        }}>{intro}</div>

        {children}

        {showCloser && <Closer isMobile={isMobile} {...(closer || {})} />}
        <Footer current={path} />
      </div>
    </div>
  );
}
