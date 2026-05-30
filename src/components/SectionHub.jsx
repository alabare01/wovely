import { useMemo, useState } from "react";
import { T } from "../theme.jsx";
import RowManager from "../RowManager.jsx";

// S76 hub-and-spoke renderer for complex multi-section patterns (Craft tier).
// A multi_section_pattern is ONE finished object made of many named parts
// (e.g. a tieback = flower + leaves + cord + ties). The hub presents each part
// as its own card; tapping a card drills into a focused row view for just that
// part. The focused view reuses RowManager (full pattern rows, scoped via
// focusHeaderId) so progress, sub-counters, and milestones behave identically
// to the inline view.

// Per-card visual treatment. Sections carry no per-section imagery in the
// extraction payload, so cards are differentiated by a deterministic on-brand
// tint + index badge — no two adjacent cards read the same (S76 bug 3). All
// tints are inside the locked palette (no #1A1A2E, terracotta, or cream).
const PALETTE = [
  { bg: "#F3EEFA", ring: "#9B7EC8" }, // lavender (primary)
  { bg: "#EAF1EC", ring: "#5B9B6B" }, // sage
  { bg: "#FBF3E2", ring: "#C9A84C" }, // gold
  { bg: "#EAEEF7", ring: "#2D3A7C" }, // navy
  { bg: "#EFEAF6", ring: "#7A6BB0" }, // muted violet
  { bg: "#EDF4F1", ring: "#4F8C76" }, // teal-sage
];

const cleanName = (text) => (text || "").replace(/──/g, "").trim() || "Section";

const GLASS = {
  background: "rgba(255,255,255,0.82)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  border: "1px solid rgba(255,255,255,0.45)",
  borderRadius: 16,
  boxShadow: "0 4px 24px rgba(45,58,124,0.08)",
};

const SectionHub = (props) => {
  const { p, rows, Bar } = props;
  const [selectedId, setSelectedId] = useState(null);

  // Split the flat rows into sections at header boundaries — same shape
  // RowManager uses internally, so the hub and the focused view agree.
  const sections = useMemo(() => {
    const secs = [];
    let cur = { header: null, rows: [] };
    rows.forEach((r) => {
      if (r.isHeader) {
        if (cur.header || cur.rows.length) secs.push(cur);
        cur = { header: r, rows: [] };
      } else {
        cur.rows.push(r);
      }
    });
    if (cur.header || cur.rows.length) secs.push(cur);
    return secs;
  }, [rows]);

  const selected = selectedId != null ? sections.find((s) => s.header?.id === selectedId) : null;

  // ── Focused (spoke) view ──
  if (selected) {
    return (
      <div>
        <button
          onClick={() => setSelectedId(null)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: T.terra, cursor: "pointer", fontSize: 13, fontWeight: 600, padding: "4px 0", marginBottom: 12 }}
        >
          ← All sections
        </button>
        <div style={{ fontFamily: T.serif, fontSize: 20, color: T.ink, marginBottom: 14, lineHeight: 1.25 }}>
          {cleanName(selected.header?.text)}
          {selected.header?.makeCount > 1 && (
            <span style={{ marginLeft: 8, background: T.gold, color: "#fff", borderRadius: 99, padding: "2px 8px", fontSize: 11, fontWeight: 700, verticalAlign: "middle" }}>×{selected.header.makeCount}</span>
          )}
        </div>
        <RowManager {...props} focusHeaderId={selectedId} />
      </div>
    );
  }

  // ── Hub view ──
  return (
    <div>
      <div style={{ fontSize: 12, color: T.ink3, fontWeight: 600, letterSpacing: ".04em", marginBottom: 12, textTransform: "uppercase" }}>
        {sections.length} sections. Tap a part to work it
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {sections.map((sec, i) => {
          const key = sec.header?.id || "sec-" + i;
          const countable = sec.rows.filter((r) => !r.isNoteOnly);
          const total = countable.length;
          const done = countable.filter((r) => r.done).length;
          const complete = total > 0 && done === total;
          const tint = PALETTE[i % PALETTE.length];
          return (
            <button
              key={key}
              onClick={() => setSelectedId(sec.header?.id ?? null)}
              style={{ ...GLASS, padding: "16px", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, minHeight: 116, position: "relative", borderTop: `3px solid ${tint.ring}` }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: tint.bg, color: tint.ring, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.serif, fontSize: 16, fontWeight: 700 }}>
                  {complete ? "✓" : i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cleanName(sec.header?.text)}</div>
                  <div style={{ fontSize: 11, color: complete ? T.sage : T.ink3, marginTop: 2 }}>
                    {total === 0 ? "Reference" : `${done} of ${total} steps`}
                  </div>
                </div>
                {sec.header?.makeCount > 1 && (
                  <div style={{ background: T.gold, color: "#fff", borderRadius: 99, padding: "2px 7px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>×{sec.header.makeCount}</div>
                )}
              </div>
              {total > 0 && <Bar val={(done / total) * 100} color={complete ? T.sage : tint.ring} h={4} />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SectionHub;
