import { useState } from "react";

// First-run fork. Shown in place of the empty library for both fresh signups
// and guests who have not saved anything yet. Two warm choices in Bev's voice:
// bring your own pattern in, or start with ours. Picking the starter runs the
// REAL import pipeline (S83): App fetches the starter PDF from storage, runs
// the same client-side extraction as an upload, and enqueues a real import
// job — the floating ImportPill walks the real worker phases from there.
// One hardcoded starter (the STARTER constant in App.jsx) — no table reads.
// Styling follows the guide: lavender, navy, Playfair headings, glass cards.

const LAV = "#9B7EC8";
const NAVY = "#2D3A7C";
const INK = "#2D2D4E";
const MUTED = "#6B6B8A";
const PF = "'Playfair Display',Georgia,serif";
const INTER = "Inter,sans-serif";

const GLASS = {
  background: "rgba(255,255,255,0.82)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.6)",
  borderRadius: 20,
  boxShadow: "0 2px 4px rgba(0,0,0,0.04), 0 8px 32px rgba(155,126,200,0.13)",
};

const ForkCard = ({ title, body, cta, onClick, primary }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        ...GLASS,
        textAlign: "left",
        cursor: "pointer",
        padding: "26px 24px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        transition: "transform .16s ease, box-shadow .16s ease, border-color .16s ease",
        transform: hover ? "translateY(-3px)" : "none",
        boxShadow: hover ? "0 12px 36px rgba(155,126,200,0.22)" : GLASS.boxShadow,
        borderColor: hover ? "rgba(155,126,200,0.55)" : GLASS.border,
        minHeight: 188,
      }}
    >
      <div style={{ fontFamily: PF, fontSize: 21, fontWeight: 700, color: NAVY, lineHeight: 1.25 }}>{title}</div>
      <div style={{ fontFamily: INTER, fontSize: 14, color: MUTED, lineHeight: 1.55, flex: 1 }}>{body}</div>
      <span style={{ fontFamily: INTER, fontSize: 14, fontWeight: 600, color: primary ? "#fff" : LAV, background: primary ? LAV : "transparent", border: primary ? "none" : `1.5px solid ${LAV}`, borderRadius: 12, padding: "10px 18px", alignSelf: "flex-start", marginTop: 4 }}>{cta}</span>
    </button>
  );
};

const StarterTile = ({ starter, busy, onPick }) => {
  const [hover, setHover] = useState(false);
  const cover = starter.coverUrl || "";
  const title = starter.title || "Starter pattern";
  return (
    <button
      onClick={busy ? undefined : onPick}
      disabled={busy}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...GLASS, padding: 0, overflow: "hidden", cursor: busy ? "default" : "pointer", textAlign: "left", display: "flex", flexDirection: "column", transition: "transform .16s ease, box-shadow .16s ease", transform: hover && !busy ? "translateY(-3px)" : "none", boxShadow: hover && !busy ? "0 12px 36px rgba(155,126,200,0.22)" : GLASS.boxShadow, opacity: busy ? 0.7 : 1 }}
    >
      <div style={{ height: 200, background: "linear-gradient(135deg,#EDE4F7 0%,#F5F0FA 100%)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {cover
          ? <img src={cover} alt={title} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          : <span style={{ fontFamily: PF, fontSize: 40, color: LAV, opacity: 0.5 }}>{(title || "?")[0]}</span>}
      </div>
      <div style={{ padding: "16px 18px 18px" }}>
        <div style={{ fontFamily: PF, fontSize: 17, fontWeight: 600, color: NAVY, lineHeight: 1.3, marginBottom: 6 }}>{title}</div>
        {starter.blurb && <div style={{ fontFamily: INTER, fontSize: 13, color: MUTED, lineHeight: 1.55, marginBottom: 10 }}>{starter.blurb}</div>}
        <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: "#fff", background: LAV, borderRadius: 10, padding: "9px 16px", display: "inline-block" }}>{busy ? "Getting it ready..." : "Start this one"}</span>
      </div>
    </button>
  );
};

const Wrap = ({ children }) => (
  <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 20px 80px", width: "100%", boxSizing: "border-box" }}>{children}</div>
);

export default function FirstRunFork({ mode = "fork", starter = null, busy = false, error = false, onImportOwn, onShowGallery, onBack, onPickStarter, isMobile = false }) {
  if (mode === "gallery") {
    return (
      <Wrap>
        <button onClick={onBack} style={{ background: "none", border: "none", color: LAV, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: INTER, padding: 0, marginBottom: 18 }}>← Back</button>
        <h1 style={{ fontFamily: PF, fontSize: 28, fontWeight: 700, color: NAVY, marginBottom: 8, lineHeight: 1.2 }}>Start with this one</h1>
        <p style={{ fontFamily: INTER, fontSize: 15, color: MUTED, marginBottom: 28, lineHeight: 1.5 }}>Pick it and Bev will bring it in just like a real import — you can start stitching as soon as she's done.</p>

        {error && (
          <div style={{ ...GLASS, padding: "28px 24px", textAlign: "center", marginBottom: 20 }}>
            <div style={{ fontFamily: PF, fontSize: 18, fontWeight: 600, color: NAVY, marginBottom: 8 }}>I could not get that one ready</div>
            <p style={{ fontFamily: INTER, fontSize: 14, color: MUTED, marginBottom: 18, lineHeight: 1.5 }}>Give it another try, or bring in a pattern of your own and I will set it up.</p>
            <button onClick={onImportOwn} style={{ background: LAV, color: "#fff", border: "none", borderRadius: 12, padding: "11px 22px", fontSize: 14, fontWeight: 600, fontFamily: INTER, cursor: "pointer" }}>Import my own pattern</button>
          </div>
        )}

        {starter && (
          <div style={{ maxWidth: isMobile ? 340 : 380, margin: "0 auto" }}>
            <StarterTile starter={starter} busy={busy} onPick={onPickStarter} />
          </div>
        )}
      </Wrap>
    );
  }

  // Default: the two-choice fork.
  return (
    <Wrap>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", marginBottom: 30 }}>
        <img src="/bev_neutral.png" alt="Bev" style={{ width: 72, height: 72, objectFit: "contain", marginBottom: 14 }} />
        <h1 style={{ fontFamily: PF, fontSize: 28, fontWeight: 700, color: NAVY, marginBottom: 8, lineHeight: 1.2 }}>Let us get your first pattern going</h1>
        <p style={{ fontFamily: INTER, fontSize: 15, color: MUTED, maxWidth: 460, lineHeight: 1.55 }}>Two easy ways to begin. Pick whichever feels right, and I will take it from there.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 16 : 20 }}>
        <ForkCard
          primary
          title="Import your own pattern"
          body="Have a PDF, a photo, or a link? Bring it in and I will get it set up and ready to track."
          cta="Import a pattern"
          onClick={onImportOwn}
        />
        <ForkCard
          title="Start with one of ours"
          body="Not ready to import yet? Grab a ready made pattern and start stitching in a few taps."
          cta="See the starter"
          onClick={onShowGallery}
        />
      </div>
    </Wrap>
  );
}
