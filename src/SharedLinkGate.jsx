import { useEffect } from "react";
import posthog from "posthog-js";

/* ─────────────────────────────────────────────────────────────────────────────
   SHARED-LINK GATE

   WHY THIS FILE EXISTS
   Audited live on 2026-09-08: a signed-out stranger opening
   wovely.app/pattern/<any id> was handed the logged-in app shell. The page
   said "Welcome back. Your Wovely is ready", "Your crochet space", "Free plan,
   0 of 5 patterns". No not-found, no sign-in prompt, and not one word about
   the pattern they had been sent. /collections/:id and /hive/:id did the same.

   That is the growth loop, and it was the worst possible version of it: a
   maker shares her work, her friend gets an empty app belonging to nobody and
   concludes the link is broken.

   /stitch/:id already did this correctly ("Result not found. This link may
   have expired or the result was removed." plus a "Go to Wovely" button) and
   this screen is deliberately built to the same shape.

   TWO CASES, ONE SCREEN, DIFFERENT ANSWERS
     · reason="signed-out" — the id may well be real, but private content is
       scoped to its owner, so nobody can be shown it without a session. This
       invites a sign-in and remembers where they were going, so signing in
       lands them on the pattern rather than on the dashboard.
     · reason="not-found"  — the id resolved to nothing. Dead end, stated
       plainly, with a way onward.

   The second case must never be a dead end for a first-time visitor, so both
   carry a "Start free" route as well.
   ──────────────────────────────────────────────────────────────────────────── */

// What kind of thing the link pointed at, for the copy only.
const NOUN = {
  pattern: "pattern",
  collection: "collection",
};

const page = { minHeight: "100vh", background: "#F5F2FF", fontFamily: "Nunito,-apple-system,sans-serif" };
const header = {
  background: "#fff", borderBottom: "1px solid #ECE6F8", padding: "0 24px", height: 56,
  display: "flex", alignItems: "center", justifyContent: "space-between",
  position: "sticky", top: 0, zIndex: 10,
};
const primary = {
  background: "#7B6AD4", color: "#fff", borderRadius: 99, padding: "12px 28px",
  fontSize: 14, fontWeight: 700, textDecoration: "none", display: "inline-block",
  border: 0, cursor: "pointer", fontFamily: "Nunito,sans-serif",
};
const secondary = {
  background: "#fff", color: "#7B6AD4", border: "1.5px solid #ECE6F8", borderRadius: 99,
  padding: "12px 28px", fontSize: 14, fontWeight: 700, textDecoration: "none",
  display: "inline-block", cursor: "pointer", fontFamily: "Nunito,sans-serif",
};

/*
  `onSignIn` and `onStartFree` are handed in by App so the buttons stay inside
  the client router. Both fall back to a real href, so the controls work as
  links (middle-click, open in new tab, announced to a screen reader) and are
  never dependent on a handler having been wired.
*/
const SharedLinkGate = ({
  kind = "pattern",
  reason = "signed-out",
  onSignIn = null,
  onStartFree = null,
}) => {
  const noun = NOUN[kind] || "pattern";

  useEffect(() => {
    try { posthog.capture("shared_link_gate_shown", { kind, reason }); } catch {}
  }, [kind, reason]);

  const signedOut = reason === "signed-out";

  const handle = (fn) => (e) => {
    if (!fn) return;
    e.preventDefault();
    fn();
  };

  return (
    <div style={page}>
      <header style={header}>
        <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, textDecoration: "none" }} onClick={handle(onStartFree)}>
          <img src="/bev_neutral.png" alt="Bev" style={{ width: 28, height: 28, objectFit: "contain" }} />
          <span style={{ fontFamily: "'Fredoka',serif", fontSize: 18, fontWeight: 700, color: "#2E2748" }}>Wovely</span>
        </a>
        {/* Only the signed-out case has anything to sign in to. Offering it to
            a signed-in viewer who followed a dead link would be nonsense. */}
        {signedOut && (
          <a href="/" style={{ fontSize: 13, color: "#7B6AD4", fontWeight: 700, textDecoration: "none" }} onClick={handle(onSignIn)}>Sign in</a>
        )}
      </header>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "calc(100vh - 56px)" }}>
        <div style={{ textAlign: "center", padding: 24, maxWidth: 460 }}>
          <img src="/bev-hero.png" alt="Bev" style={{ width: 108, filter: "drop-shadow(0 12px 18px rgba(90,66,160,.35))" }} />

          <div style={{ fontFamily: "'Fredoka',serif", fontSize: 24, fontWeight: 700, color: "#2E2748", margin: "14px 0 8px" }}>
            {signedOut ? `This ${noun} lives in someone's Wovely` : `That ${noun} is not here`}
          </div>

          <div style={{ fontSize: 14.5, color: "#726A92", lineHeight: 1.6, marginBottom: 24 }}>
            {signedOut
              ? `Patterns and collections stay private to the account that holds them. Sign in and we will take you straight to it. No account yet? Starting one is free, and your first pattern is two minutes away.`
              : `This link may have expired, or the ${noun} was removed by the person who made it. Nothing you did went wrong.`}
          </div>

          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            {signedOut && (
              <a href="/" style={primary} onClick={handle(onSignIn)}>Sign in to view it</a>
            )}
            <a href="/" style={signedOut ? secondary : primary} onClick={handle(onStartFree)}>
              {signedOut ? "Start free" : "Go to Wovely"}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedLinkGate;
