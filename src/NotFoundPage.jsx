// ─── THE HONEST DEAD END ─────────────────────────────────────────────────────
//
// Any path the app does not recognize used to render My Wovely under the home
// title, so /nope-xyz, /gauge-calculator and every mistyped link read to Google
// as a copy of the home page (SEO desk, 2026-09-16, soft 404). The catch-all
// rewrite stays, on purpose: vite.config.js records why a shared pattern link
// must never hard-404. This page is the second-best the desk named: the
// status is still 200, the title says not found, and utils/seo.js marks it
// noindex, so it is neither indexed nor folded into the home page.
//
// Bev's register. No price, no numbers, two doors.

import { useBreakpoint, T } from "./theme.jsx";
import PublicPage, { CARD } from "./components/PublicPage.jsx";

const DOORS = [
  ["My Wovely", "/", "Your patterns, your rows, your place kept."],
  ["The free tools", "/tools", "Gauge, yardage, scale and stitch counts. No account."],
  ["UK to US terms", "/uk-us-crochet-terms", "Paste a whole pattern, get it back in your terms."],
];

export default function NotFoundPage({ pathname }) {
  const { isMobile } = useBreakpoint();
  return (
    <PublicPage
      path="/404"
      h1="Bev looked, and that page is not here"
      intro={
        <>
          The link you followed points somewhere Wovely does not have. It may have moved, or a letter
          may be off. Nothing of yours is lost. Pick a door.
        </>
      }
      showCloser={false}
    >
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
        {DOORS.map(([label, href, line]) => (
          <a key={href} href={href} style={{ ...CARD, padding: isMobile ? 18 : 22, textDecoration: "none", color: T.ink, display: "block" }}>
            <div style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 20, marginBottom: 6 }}>{label}</div>
            <div style={{ fontFamily: T.body, fontSize: 14.5, lineHeight: 1.6, color: T.muted }}>{line}</div>
          </a>
        ))}
      </div>
      {pathname && (
        <p style={{ fontFamily: T.body, fontSize: 13, color: T.muted, margin: "0 0 32px" }}>
          You asked for <code style={{ fontFamily: "ui-monospace, monospace", fontSize: 12.5, background: T.soft, padding: "2px 6px", borderRadius: 6 }}>{pathname}</code>
        </p>
      )}
    </PublicPage>
  );
}
