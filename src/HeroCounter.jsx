import { useState, useRef } from "react";
import posthog from "posthog-js";
import { T } from "./theme.jsx";
import { pulse } from "./utils/pulse.js";
import { DEMO_ROWS } from "./GuestDemo.jsx";

/* ---------------------------------------------------------------------------
   HERO COUNTER: the product, on the landing page, zero clicks in.

   WHY THIS EXISTS (2026-09-15)
   Fourteen days of PostHog on wovely.app, the house IPs and the crawlers
   removed: 21 stranger sessions, 19 of them saw one page and left, 11 of them
   inside ten seconds. One stranger reached the "Try Wovely free" fork. Zero
   reached the demo. Zero tapped a row. Every row tapped in the window came
   from the house IP.

   The demo behind the fork is the right screen and nobody sees it, because it
   sits two clicks and three screens past the hero, and the hero itself showed
   a PICTURE of a counter ("Round 33 of 51, 64%") that did nothing when
   touched. A stranger deciding in seven seconds does not click through to
   find out whether the picture is real.

   So the picture is now the thing. The card in the hero is the same Button
   the Mushroom rounds the demo runs, tappable, with the counter and the bar
   moving on the first tap. Nothing saved, nothing asked, no auth, no fetch,
   no storage: the same absence-of-code guarantee GuestDemo.jsx makes.

   THE FUNNEL IT MAKES READABLE
   hero_row_tapped {first:true}      a stranger touched the product
   hero_row_tapped {first:false}     kept going
   hero_counter_converted {to}       chose to keep it (starter) or import
   Then the existing guest_fork_path_chosen fires from tryFork() as before,
   so the old funnel keeps its shape and this sits in front of it.
   --------------------------------------------------------------------------- */

const TOTAL = DEMO_ROWS.length;
const WINDOW = 3;

const Tick = ({ on, accent }) => (
  <span aria-hidden="true" style={{
    flex: "none", width: 24, height: 24, borderRadius: "50%",
    border: on ? `2px solid ${accent}` : `2px solid ${T.line}`,
    background: on ? accent : "#fff",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "background .15s, border-color .15s",
  }}>
    {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>}
  </span>
);

/**
 * @param fall        true while the grand-opening hero is up (cinnamon accents)
 * @param onKeep      keep this pattern for real: tryFork("starter") in Auth.jsx
 * @param onImportOwn bring your own: tryFork("import") in Auth.jsx
 */
export default function HeroCounter({ fall = false, onKeep, onImportOwn }) {
  const [doneIds, setDoneIds] = useState(() => new Set());
  const firstTapSent = useRef(false);
  const accent = fall ? "#C96A3B" : T.accent;

  const doneCount = doneIds.size;
  const pct = Math.round((doneCount / TOTAL) * 100);
  const nextIdx = DEMO_ROWS.findIndex(r => !doneIds.has(r.id));
  const allDone = nextIdx === -1;
  const stitches = doneCount > 0
    ? DEMO_ROWS[DEMO_ROWS.map(r => doneIds.has(r.id)).lastIndexOf(true)]?.count
    : 0;

  // A window of three rows that slides with the next one, so the card keeps
  // its height in the hero grid and always points at something to tap.
  const start = allDone ? TOTAL - WINDOW : Math.max(0, Math.min(nextIdx - 1, TOTAL - WINDOW));
  const visible = DEMO_ROWS.slice(start, start + WINDOW);

  const toggle = (row, idx) => {
    let nowDone = false;
    setDoneIds(prev => {
      const next = new Set(prev);
      if (next.has(row.id)) next.delete(row.id);
      else { next.add(row.id); nowDone = true; }
      return next;
    });
    try {
      if (!firstTapSent.current) {
        firstTapSent.current = true;
        posthog.capture("hero_row_tapped", { first: true, row: row.label, row_index: idx });
        pulse("demo_started", { row_index: idx, surface: "hero" });
      } else if (nowDone) {
        posthog.capture("hero_row_tapped", { first: false, row: row.label, row_index: idx });
      }
    } catch {}
  };

  const convert = (to, fn) => {
    try { posthog.capture("hero_counter_converted", { to, rows_done: doneIds.size }); } catch {}
    try { pulse("demo_converted", { to, rows_done: doneIds.size, surface: "hero" }); } catch {}
    fn();
  };

  const headline = doneCount === 0
    ? "Tap a round. This is the whole app."
    : allDone ? "Cap done. That is the whole app." : "Keep going. Your place is kept.";

  return (
    <div className="herocounter" style={{ fontFamily: T.body, color: T.ink }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px 12px", borderBottom: `1px solid ${T.line}` }}>
        <img src="/cover-mushroom-photo.png" alt="Button the Mushroom, a small crocheted toadstool" style={{ width: 46, height: 46, borderRadius: 12, objectFit: "cover", flex: "none", background: T.soft }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: T.disp, fontWeight: 600, fontSize: 17, lineHeight: 1.15 }}>Button the Mushroom</div>
          <div style={{ fontWeight: 700, fontSize: 12, color: T.muted, marginTop: 2 }}>{headline}</div>
        </div>
        <div style={{ flex: "none", textAlign: "right" }}>
          <div style={{ fontFamily: T.disp, fontWeight: 600, fontSize: 19, lineHeight: 1, color: accent }}>
            {doneCount}<span style={{ fontSize: 12, color: T.muted, fontWeight: 700 }}> of {TOTAL}</span>
          </div>
          <div style={{ fontWeight: 800, fontSize: 11, color: T.muted, marginTop: 3 }}>{stitches > 0 ? `${stitches} sts on the hook` : "rounds"}</div>
        </div>
      </div>

      <div style={{ padding: "10px 16px 4px" }}>
        <div style={{ height: 8, borderRadius: 99, background: T.line, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, borderRadius: 99, background: fall ? "linear-gradient(90deg,#C96A3B,#FFC24B)" : `linear-gradient(90deg, ${T.accent}, ${T.pink})`, transition: "width .25s ease" }} />
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "8px 12px 10px" }}>
        {visible.map(row => {
          const idx = DEMO_ROWS.indexOf(row);
          const done = doneIds.has(row.id);
          const isNext = idx === nextIdx;
          return (
            <button key={row.id} type="button" onClick={() => toggle(row, idx)} aria-pressed={done} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", cursor: "pointer",
              fontFamily: T.body, padding: "10px 12px", borderRadius: 13,
              background: done ? T.soft : "#fff",
              border: `1.5px solid ${isNext ? accent : T.line}`,
              boxShadow: isNext ? `0 10px 22px -18px ${accent}` : "none",
              transition: "background .15s, border-color .15s",
            }}>
              <Tick on={done} accent={accent} />
              <span style={{ flex: "none", width: 66, fontWeight: 800, fontSize: 12, color: done ? T.ink3 : accent }}>{row.label}</span>
              <span style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13, lineHeight: 1.35, color: done ? T.ink3 : T.ink, textDecoration: done ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.text}</span>
              <span style={{ flex: "none", fontWeight: 800, fontSize: 11.5, color: T.muted, background: T.bg, border: `1px solid ${T.line}`, borderRadius: 999, padding: "3px 8px" }}>({row.count})</span>
            </button>
          );
        })}
      </div>

      <div style={{ padding: "0 16px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", fontWeight: 700, fontSize: 12.5, color: T.muted, minHeight: 22 }}>
        {doneCount > 0 ? (
          <>
            <button type="button" onClick={() => convert("starter", onKeep)} style={{ border: 0, borderRadius: 11, padding: "9px 14px", background: accent, color: "#fff", fontFamily: T.body, fontWeight: 800, fontSize: 13, cursor: "pointer" }}>Keep this pattern</button>
            <a onClick={() => convert("import", onImportOwn)} role="button" tabIndex={0} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); convert("import", onImportOwn); } }} style={{ color: accent, fontWeight: 800, cursor: "pointer" }}>or bring your own</a>
            <span style={{ flexBasis: "100%", fontSize: 11.5 }}>No account, no card. Nothing here is saved until you say so.</span>
          </>
        ) : (
          <span>Nothing saved, nothing asked. Every round adds up: 6, 12, 18, 24.</span>
        )}
      </div>
    </div>
  );
}
