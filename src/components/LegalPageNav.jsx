import { useNavigate } from "react-router-dom";

/* ─────────────────────────────────────────────────────────────────────────────
   NAVIGATION FOR /privacy AND /terms

   WHY THIS FILE EXISTS
   Audited live 2026-09-08: document.querySelectorAll('a').length was 0 on both
   legal pages. Zero anchors on the whole page. Their only control was a
   "← Back" button wired to navigate(-1), and arriving from a Google result and
   clicking it went back to google.com. Two indexed URLs whose one control
   ejected the visitor off the site.

   navigate(-1) is a history pop, not a route. It is correct only when the
   visitor got here from somewhere inside Wovely, and it is worst exactly when
   the page is doing its job, which is being found from outside.

   These are real anchors with real hrefs. The onClick keeps the client router
   in charge for an in-app click, and a modified click (new tab, new window)
   falls through to the browser untouched.
   ──────────────────────────────────────────────────────────────────────────── */

const linkStyle = {
  color: "#7B6AD4", fontSize: 13, fontWeight: 700, textDecoration: "none",
  cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4,
};

export const LegalTopNav = () => {
  const navigate = useNavigate();
  const go = (e, path) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(path);
  };
  return (
    <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 6 }}>
      <a href="/" style={linkStyle} onClick={e => go(e, "/")}>← Back to Wovely</a>
    </div>
  );
};

export const LegalBottomNav = ({ other }) => {
  const navigate = useNavigate();
  const go = (e, path) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(path);
  };
  const otherHref = other === "terms" ? "/terms" : "/privacy";
  const otherLabel = other === "terms" ? "Terms of Service" : "Privacy Policy";
  return (
    <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid #ECE6F8", display: "flex", flexWrap: "wrap", gap: "10px 20px", fontSize: 13 }}>
      <a href="/" style={linkStyle} onClick={e => go(e, "/")}>Wovely home</a>
      <a href={otherHref} style={linkStyle} onClick={e => go(e, otherHref)}>{otherLabel}</a>
      <a href="/tools" style={linkStyle} onClick={e => go(e, "/tools")}>Free crochet tools</a>
      <a href="mailto:bev@wovely.app" style={linkStyle}>bev@wovely.app</a>
    </div>
  );
};
