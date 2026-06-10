import { useState } from "react";

// First-run fork. Shown in place of the empty library for both fresh signups
// and guests who have not saved anything yet. Two warm choices in Bev's voice:
// bring your own pattern in, or start with one of ours. Picking one of ours
// runs the same loading sequence as a real import (App drives the floating
// ImportPill beat, then the reveal) and drops the user into a real, owned copy
// of the pattern. Styling follows the guide: lavender, navy, Playfair headings,
// glass cards.

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

const StarterTile = ({ row, onPick }) => {
  const [hover, setHover] = useState(false);
  const cover = row.cover_image_url || row.photo || "";
  const title = row.title || "Starter pattern";
  return (
    <button
      onClick={() => onPick(row)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ ...GLASS, padding: 0, overflow: "hidden", cursor: "pointer", textAlign: "left", display: "flex", flexDirection: "column", transition: "transform .16s ease, box-shadow .16s ease", transform: hover ? "translateY(-3px)" : "none", boxShadow: hover ? "0 12px 36px rgba(155,126,200,0.22)" : GLASS.boxShadow }}
    >
      <div style={{ height: 168, background: "linear-gradient(135deg,#EDE4F7 0%,#F5F0FA 100%)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {cover
          ? <img src={cover} alt={title} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
          : <span style={{ fontFamily: PF, fontSize: 40, color: LAV, opacity: 0.5 }}>{(title || "?")[0]}</span>}
      </div>
      <div style={{ padding: "14px 16px 16px" }}>
        <div style={{ fontFamily: PF, fontSize: 15, fontWeight: 600, color: NAVY, lineHeight: 1.3, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{title}</div>
        <span style={{ fontFamily: INTER, fontSize: 13, fontWeight: 600, color: LAV }}>Start this one</span>
      </div>
    </button>
  );
};

const Wrap = ({ children }) => (
  <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 20px 80px", width: "100%", boxSizing: "border-box" }}>{children}</div>
);

export default function FirstRunFork({ mode = "fork", catalog = [], loading = false, error = false, onImportOwn, onShowGallery, onBack, onPickStarter, isMobile = false }) {
  if (mode === "gallery") {
    return (
      <Wrap>
        <button onClick={onBack} style={{ background: "none", border: "none", color: LAV, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: INTER, padding: 0, marginBottom: 18 }}>← Back</button>
        <h1 style={{ fontFamily: PF, fontSize: 28, fontWeight: 700, color: NAVY, marginBottom: 8, lineHeight: 1.2 }}>Pick a pattern to start with</h1>
        <p style={{ fontFamily: INTER, fontSize: 15, color: MUTED, marginBottom: 28, lineHeight: 1.5 }}>Choose one and I will add it to your library so you can start stitching right away.</p>

        {loading && (
          <div style={{ textAlign: "center", padding: "60px 20px" }}>
            <div style={{ position: "relative", width: 64, height: 64, margin: "0 auto 16px" }}>
              <div className="spinner" style={{ position: "absolute", inset: 0, border: "3px solid #EDE4F7", borderTopColor: LAV, borderRadius: "50%" }} />
              <img src="/bev_neutral.png" alt="Bev" style={{ position: "absolute", inset: 9, width: 46, height: 46, objectFit: "contain" }} />
            </div>
            <div style={{ fontFamily: INTER, fontSize: 14, color: MUTED }}>Finding patterns for you...</div>
          </div>
        )}

        {!loading && error && (
          <div style={{ ...GLASS, padding: "28px 24px", textAlign: "center" }}>
            <div style={{ fontFamily: PF, fontSize: 18, fontWeight: 600, color: NAVY, marginBottom: 8 }}>I could not load those just now</div>
            <p style={{ fontFamily: INTER, fontSize: 14, color: MUTED, marginBottom: 18, lineHeight: 1.5 }}>Let us try your own pattern instead. You can always come back to these.</p>
            <button onClick={onImportOwn} style={{ background: LAV, color: "#fff", border: "none", borderRadius: 12, padding: "11px 22px", fontSize: 14, fontWeight: 600, fontFamily: INTER, cursor: "pointer" }}>Import my own pattern</button>
          </div>
        )}

        {!loading && !error && catalog.length === 0 && (
          <div style={{ ...GLASS, padding: "28px 24px", textAlign: "center" }}>
            <div style={{ fontFamily: PF, fontSize: 18, fontWeight: 600, color: NAVY, marginBottom: 8 }}>No starters here just yet</div>
            <p style={{ fontFamily: INTER, fontSize: 14, color: MUTED, marginBottom: 18, lineHeight: 1.5 }}>More are on the way. For now, bring in a pattern of your own and I will set it up.</p>
            <button onClick={onImportOwn} style={{ background: LAV, color: "#fff", border: "none", borderRadius: 12, padding: "11px 22px", fontSize: 14, fontWeight: 600, fontFamily: INTER, cursor: "pointer" }}>Import my own pattern</button>
          </div>
        )}

        {!loading && !error && catalog.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(3,1fr)", gap: isMobile ? 14 : 20 }}>
            {catalog.map((row) => <StarterTile key={row.id} row={row} onPick={onPickStarter} />)}
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
          cta="Browse starters"
          onClick={onShowGallery}
        />
      </div>
    </Wrap>
  );
}
