import { useState } from "react";

// First-run fork. Shown in place of the empty library for both fresh signups
// and guests who have not saved anything yet. Two warm choices in Bev's voice:
// bring your own pattern in, or take ours.
//
// ONE CLICK, NOT TWO (2026-09-08). "Start with ours" used to open a gallery
// screen holding exactly one card, which the reader then had to pick. A gallery
// of one is a speed bump, not a choice, and it sat on the single most important
// path in the product. The card now takes the pattern directly: App inserts the
// committed fixture (src/data/starterPattern.js) and opens it.
//
// Behind it, the starter no longer runs the import pipeline at all. It used to
// fetch the PDF, read it with pdf.js, queue a job and wait on a model, which is
// why this file once carried a busy state, an error state and a retry. The busy
// state stays (an INSERT is fast, not instant) and so does the error, because a
// write can still fail.
//
// Styling matches the landing mockup's fork cards (Wovely Landing.dc.html):
// solid white cards, hairline border, impviz collage on the import card.

const LAV = "#7B6AD4";
const INK = "#2E2748";
const MUTED = "#726A92";
const LINE = "#ECE6F8";
const PF = "'Fredoka','Segoe UI',sans-serif";
const BODY = "'Nunito',-apple-system,sans-serif";

const CARD = {
  background: "#fff",
  border: `1.5px solid ${LINE}`,
  borderRadius: 20,
  padding: 20,
  boxShadow: "0 12px 26px -22px rgba(90,66,160,.35)",
  textAlign: "left",
  cursor: "pointer",
  display: "flex",
  flexDirection: "column",
  fontFamily: BODY,
  transition: "transform .15s, border-color .15s, box-shadow .15s",
};

const ForkShell = ({ onClick, children, disabled }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...CARD,
        transform: hover && !disabled ? "translateY(-2px)" : "none",
        borderColor: hover && !disabled ? LAV : undefined,
        boxShadow: hover && !disabled ? "0 16px 30px -20px rgba(90,66,160,.5)" : CARD.boxShadow,
        opacity: disabled ? 0.7 : 1,
      }}
    >{children}</button>
  );
};

const ForkTitle = ({ children }) => (
  <div style={{ fontFamily: PF, fontWeight: 600, fontSize: 18, color: INK, display: "flex", alignItems: "center", gap: 8 }}>{children}</div>
);
const ForkSub = ({ children }) => (
  <div style={{ fontWeight: 700, fontSize: 12.5, color: MUTED, marginTop: 7, lineHeight: 1.5 }}>{children}</div>
);
const ForkGo = ({ children }) => (
  <div style={{ fontWeight: 800, fontSize: 13, color: LAV, marginTop: "auto", paddingTop: 14 }}>{children}</div>
);

/* The mockup's .impviz collage: a pattern page ready to jump in */
const ImpViz = () => (
  <div style={{ aspectRatio: "2.35/1", borderRadius: 13, background: "#F3EEFB", border: "1.5px dashed #CBBBEE", position: "relative", overflow: "hidden", marginBottom: 15 }}>
    <div style={{ position: "absolute", left: "35%", top: "15%", width: "26%", aspectRatio: "3/4", background: "#fff", border: `1px solid ${LINE}`, borderRadius: 6, transform: "rotate(5deg)", boxShadow: "0 10px 20px -12px rgba(60,40,110,.3)" }} />
    <img src="/import-sample.png" alt="" style={{ position: "absolute", left: "12%", top: "9%", width: "27%", borderRadius: 6, boxShadow: "0 12px 24px -10px rgba(60,40,110,.4)", transform: "rotate(-5deg)", zIndex: 2 }} />
    <div style={{ position: "absolute", right: "9%", top: "50%", transform: "translateY(-50%)", width: 46, height: 46, borderRadius: "50%", background: LAV, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 10px 20px -8px rgba(90,66,160,.55)", zIndex: 3 }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h13M13 6.5l5.5 5.5-5.5 5.5" /></svg>
    </div>
  </div>
);

const Wrap = ({ children }) => (
  <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px 80px", width: "100%", boxSizing: "border-box", fontFamily: BODY }}>{children}</div>
);

export default function FirstRunFork({ starter = null, busy = false, error = false, onImportOwn, onPickStarter, isMobile = false }) {
  const starterTitle = starter?.title || "our free pattern";
  return (
    <Wrap>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 26 }}>
        <img src="/bev-hero.png" alt="Bev" style={{ width: 92, objectFit: "contain", marginBottom: 6, filter: "drop-shadow(0 12px 18px rgba(90,66,160,.35))" }} />
        <h1 style={{ fontFamily: PF, fontSize: 28, fontWeight: 600, color: INK, marginBottom: 6, lineHeight: 1.2 }}>Let's get your first pattern going</h1>
        <p style={{ fontSize: 14, color: MUTED, maxWidth: 460, lineHeight: 1.5, fontWeight: 700 }}>No account, no card. Pick a way in and you're stitching in two minutes.</p>
      </div>

      {error && (
        <div style={{ background: "#FFF4F2", border: "1.5px solid #F0C9C0", borderRadius: 16, padding: "14px 16px", marginBottom: 14, textAlign: "center" }}>
          <div style={{ fontWeight: 800, fontSize: 13.5, color: INK, marginBottom: 4 }}>{starterTitle} did not come through</div>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: MUTED, lineHeight: 1.5 }}>Tap it once more, or bring in a pattern of your own and Bev will set it up.</div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
        <ForkShell onClick={onImportOwn}>
          <ImpViz />
          <ForkTitle>Import your own</ForkTitle>
          <ForkSub>A PDF, photos of a paper pattern, or a link. Bev reads it, checks every stitch count, and sets it up to track.</ForkSub>
          <ForkGo>Import a pattern →</ForkGo>
        </ForkShell>
        <ForkShell onClick={onPickStarter} disabled={busy}>
          <div style={{ aspectRatio: "2.35/1", borderRadius: 13, overflow: "hidden", marginBottom: 15, backgroundImage: "url('/cover-mushroom-photo.png')", backgroundSize: "cover", backgroundPosition: "center" }} role="img" aria-label="Button the Mushroom starter pattern" />
          <ForkTitle>Start with ours</ForkTitle>
          <ForkSub>Button the Mushroom, a friendly little toadstool to learn the round on. A Wovely original, on the house.</ForkSub>
          <ForkGo>{busy ? "Getting it ready..." : "Open it now →"}</ForkGo>
        </ForkShell>
      </div>
    </Wrap>
  );
}
