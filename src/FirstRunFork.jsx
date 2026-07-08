import { useState } from "react";

// First-run fork. Shown in place of the empty library for both fresh signups
// and guests who have not saved anything yet. Two warm choices in Bev's voice:
// bring your own pattern in, or start with ours. Picking the starter runs the
// REAL import pipeline (S83): App fetches the starter PDF from storage, runs
// the same client-side extraction as an upload, and enqueues a real import
// job — the floating ImportPill walks the real worker phases from there.
// One hardcoded starter (the STARTER constant in App.jsx) — no table reads.
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

const ForkShell = ({ onClick, gold, children, disabled }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...CARD,
        ...(gold ? {
          background: "linear-gradient(#fff,#fff) padding-box,linear-gradient(135deg,#F2C744,#E9A83C 45%,#F6E7C9) border-box",
          border: "2px solid transparent",
        } : {}),
        transform: hover && !disabled ? "translateY(-2px)" : "none",
        borderColor: !gold && hover && !disabled ? LAV : undefined,
        boxShadow: hover && !disabled
          ? (gold ? "0 16px 30px -18px rgba(200,150,40,.6)" : "0 16px 30px -20px rgba(90,66,160,.5)")
          : CARD.boxShadow,
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

/* The mockup's .impviz collage — a pattern page ready to jump in */
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

export default function FirstRunFork({ mode = "fork", starter = null, busy = false, error = false, onImportOwn, onShowGallery, onBack, onPickStarter, isMobile = false }) {
  if (mode === "gallery") {
    const cover = starter?.coverUrl || "";
    const title = starter?.title || "Starter pattern";
    return (
      <Wrap>
        <button onClick={onBack} style={{ background: "none", border: "none", color: LAV, cursor: "pointer", fontSize: 13, fontWeight: 800, fontFamily: BODY, padding: 0, marginBottom: 18 }}>← Back</button>
        <h1 style={{ fontFamily: PF, fontSize: 28, fontWeight: 600, color: INK, marginBottom: 8, lineHeight: 1.2 }}>Start with this one</h1>
        <p style={{ fontSize: 15, color: MUTED, marginBottom: 28, lineHeight: 1.5, fontWeight: 700 }}>Pick it and Bev will bring it in just like a real import — you can start stitching as soon as she's done.</p>

        {error && (
          <div style={{ ...CARD, cursor: "default", padding: "28px 24px", textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontFamily: PF, fontSize: 18, fontWeight: 600, color: INK, marginBottom: 8 }}>I could not get that one ready</div>
            <p style={{ fontSize: 14, color: MUTED, marginBottom: 18, lineHeight: 1.5, fontWeight: 700 }}>Give it another try, or bring in a pattern of your own and I will set it up.</p>
            <button onClick={onImportOwn} style={{ background: LAV, color: "#fff", border: "none", borderRadius: 14, padding: "12px 22px", fontSize: 14, fontWeight: 800, fontFamily: BODY, cursor: "pointer", boxShadow: `0 16px 30px -14px ${LAV}` }}>Import my own pattern</button>
          </div>
        )}

        {starter && (
          <div style={{ maxWidth: isMobile ? 340 : 380, margin: "0 auto" }}>
            <ForkShell onClick={onPickStarter} disabled={busy}>
              <div style={{ aspectRatio: "2.35/1", borderRadius: 13, overflow: "hidden", marginBottom: 15, background: "#F3EEFB" }}>
                {cover && <img src={cover} alt={title} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />}
              </div>
              <ForkTitle>{title}</ForkTitle>
              {starter.blurb && <ForkSub>{starter.blurb}</ForkSub>}
              <ForkGo>{busy ? "Getting it ready..." : "Start this one →"}</ForkGo>
            </ForkShell>
          </div>
        )}
      </Wrap>
    );
  }

  // Default: the two-choice fork (mockup "Try free" card content).
  return (
    <Wrap>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 26 }}>
        <img src="/bev-hero.png" alt="Bev" style={{ width: 92, objectFit: "contain", marginBottom: 6, filter: "drop-shadow(0 12px 18px rgba(90,66,160,.35))" }} />
        <h1 style={{ fontFamily: PF, fontSize: 28, fontWeight: 600, color: INK, marginBottom: 6, lineHeight: 1.2 }}>Let's get your first pattern going</h1>
        <p style={{ fontSize: 14, color: MUTED, maxWidth: 460, lineHeight: 1.5, fontWeight: 700 }}>No account, no card — pick a way in and you're stitching in two minutes.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14 }}>
        <ForkShell onClick={onImportOwn}>
          <ImpViz />
          <ForkTitle>Import your own</ForkTitle>
          <ForkSub>A PDF, photos of a paper pattern, or a link — Bev reads it, checks every stitch count, and sets it up to track.</ForkSub>
          <ForkGo>Import a pattern →</ForkGo>
        </ForkShell>
        <ForkShell onClick={onShowGallery}>
          <div style={{ aspectRatio: "2.35/1", borderRadius: 13, overflow: "hidden", marginBottom: 15, backgroundImage: "url('/cover-mushroom-photo.png')", backgroundSize: "cover", backgroundPosition: "center" }} role="img" aria-label="Button the Mushroom starter pattern" />
          <ForkTitle>Start with ours</ForkTitle>
          <ForkSub>Button the Mushroom — a friendly little toadstool to learn the round on. A Wovely original, on the house.</ForkSub>
          <ForkGo>Start this one →</ForkGo>
        </ForkShell>
      </div>
    </Wrap>
  );
}
