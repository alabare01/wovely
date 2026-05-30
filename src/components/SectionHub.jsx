import { useMemo } from "react";
import { T } from "../theme.jsx";
import { isReferenceChip } from "../utils/docType.js";

// S76 hub landing — the section grid for a multi_section pattern (ONE pattern,
// many named parts). Presentation only; this never touches housing. The grid is
// the primary content of the hub landing (PatternDetail composes the hero +
// unified materials around it). Tapping a card calls onSelect(headerId) and
// PatternDetail opens the scoped section view (instructions + notes).

// Per-card identity via a deterministic on-brand tint + index badge — no
// per-section imagery exists in the payload, and a repeated PDF cover thumbnail
// on every card was the identical-covers bug, so cards are differentiated by
// number + accent color only. All tints sit inside the locked palette.
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

const splitSections = (rows) => {
  const secs = [];
  let cur = { header: null, rows: [] };
  (rows || []).forEach((r) => {
    if (r.isHeader) {
      if (cur.header || cur.rows.length) secs.push(cur);
      cur = { header: r, rows: [] };
    } else {
      cur.rows.push(r);
    }
  });
  if (cur.header || cur.rows.length) secs.push(cur);
  return secs;
};

const SectionHub = ({ rows, onSelect, Bar }) => {
  const sections = useMemo(() => splitSections(rows), [rows]);

  return (
    <div>
      <div style={{ fontFamily: T.serif, fontSize: 18, color: T.ink, marginBottom: 4 }}>The parts</div>
      <div style={{ fontSize: 12.5, color: T.ink3, marginBottom: 14, lineHeight: 1.5 }}>
        Bev laid this project out in {sections.length} parts. Tap one to work it, in any order.
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
        {sections.map((sec, i) => {
          const key = sec.header?.id || "sec-" + i;
          const countable = sec.rows.filter((r) => !r.isNoteOnly);
          const total = countable.length;
          const done = countable.filter((r) => r.done).length;
          const complete = total > 0 && done === total;
          const hasBody = !!(sec.header && sec.header.body && String(sec.header.body).trim());
          const isReference = isReferenceChip(total, hasBody);
          const name = cleanName(sec.header?.text);

          // Reference section with no rows and no captured prose: a flat,
          // non-interactive chip. Do not promise content that isn't there
          // (S76 part D cosmetic).
          if (isReference) {
            return (
              <div key={key} style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: `1px dashed ${T.border}`, borderRadius: 12, background: T.surface, opacity: 0.85 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", color: T.ink3, background: "#fff", border: `1px solid ${T.border}`, borderRadius: 6, padding: "2px 6px" }}>REF</span>
                <span style={{ fontSize: 13, color: T.ink2, fontWeight: 600 }}>{name}</span>
              </div>
            );
          }

          const tint = PALETTE[i % PALETTE.length];
          return (
            <button
              key={key}
              onClick={() => onSelect(sec.header?.id ?? null)}
              style={{ ...GLASS, padding: "16px", textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 10, minHeight: 112, borderTop: `3px solid ${tint.ring}` }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0, background: tint.bg, color: tint.ring, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.serif, fontSize: 16, fontWeight: 700 }}>
                  {complete ? "✓" : i + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.ink, lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
                  <div style={{ fontSize: 11, color: complete ? T.sage : T.ink3, marginTop: 2 }}>
                    {total === 0 ? "Read this part" : `${done} of ${total} steps`}
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
export { splitSections };
