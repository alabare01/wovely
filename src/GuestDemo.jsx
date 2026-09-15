import { useState, useEffect, useRef } from "react";
import GuestEmailAsk from "./GuestEmailAsk.jsx";
import posthog from "posthog-js";
import { T } from "./theme.jsx";
import { pulse } from "./utils/pulse.js";

/* ─────────────────────────────────────────────────────────────────────────────
   GUEST DEMO: the zero-commitment path off the try screen.

   WHY THIS EXISTS
   Between 2026-07-17 and 2026-08-06 Wovely took zero signups and zero uploads
   while autocapture showed people clicking "Try Wovely free" and leaving. That
   click only switches screens; the screen it lands on offers two cards and both
   of them ask for something. "Import your own" asks the visitor to go find a
   PDF. "Start with ours" asks them to commit to crocheting a mushroom, and
   behind the card it runs the REAL pipeline: an anonymous Supabase sign-in, a
   PDF fetch, a queued import job. A stranger thirty seconds in is still
   deciding whether the product is real, and the screen had skipped to
   onboarding.

   This screen asks for nothing. Button the Mushroom is already open, the rows
   are already there, the counter is already running. Tap a row and watch it
   work. That is the product in fifteen seconds.

   WHAT IT DELIBERATELY DOES NOT DO
   No auth of any kind, anonymous or otherwise. No fetch. No Supabase. No
   import job. No write to localStorage or sessionStorage. Progress lives in
   React state for the life of the screen and then it is gone. Nothing here can
   create a library pattern, so nothing here can spend one of the five free
   slots. That is not a promise made in copy, it is the absence of any code
   that could do it.

   THE ROWS ARE REAL
   Every round below is the actual text of the Cap section of
   starters/button-the-mushroom-v1.pdf, the same file the live starter import
   pulls from Supabase Storage. Extracted from that PDF, not written to look
   like it. Stitch counts check out end to end (6 → 12 → 18 → 24 → 30 → 30 →
   24 → 18), which is what lets the header say the counts are checked.

   THE WAY OUT IS THE WAY IN
   Both real entry points sit at the bottom of this screen and both go through
   the existing tryFork() in Auth.jsx, which writes wovely_first_run_intent and
   enters guest mode exactly as the old cards did. The demo is the top of the
   funnel, not a sidecar.
   ──────────────────────────────────────────────────────────────────────────── */

const COVER = "/cover-mushroom-photo.png";

// The Cap, verbatim from the starter PDF (page 3). `count` is the stitch count
// the pattern prints in parentheses at the end of the round.
const DEMO_ROWS = [
  { id: "mr", label: "Magic ring", text: "Make a magic ring with 6 sc", count: 6 },
  { id: "r1", label: "Rnd 1", text: "inc in each st around", count: 12 },
  { id: "r2", label: "Rnd 2", text: "(1 sc, inc) 6 times", count: 18 },
  { id: "r3", label: "Rnd 3", text: "(2 sc, inc) 6 times", count: 24 },
  { id: "r4", label: "Rnd 4", text: "(3 sc, inc) 6 times", count: 30 },
  { id: "r57", label: "Rnds 5-7", text: "sc in each st around", count: 30 },
  { id: "r8", label: "Rnd 8", text: "(3 sc, dec) 6 times", count: 24 },
  { id: "r9", label: "Rnd 9", text: "(2 sc, dec) 6 times", count: 18 },
];

const TOTAL = DEMO_ROWS.length;

const Tick = ({ on }) => (
  <span
    aria-hidden="true"
    style={{
      flex: "none", width: 26, height: 26, borderRadius: "50%",
      border: on ? `2px solid ${T.accent}` : `2px solid ${T.line}`,
      background: on ? T.accent : "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "background .15s, border-color .15s",
    }}
  >
    {on && (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
    )}
  </span>
);

const DemoRow = ({ row, done, isNext, onToggle }) => {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onToggle}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={done}
      style={{
        display: "flex", alignItems: "center", gap: 13, width: "100%",
        textAlign: "left", cursor: "pointer", fontFamily: T.body,
        padding: "13px 14px", borderRadius: 15,
        background: done ? T.soft : isNext && hover ? "#FBF9FF" : hover ? "#FBF9FF" : "#fff",
        border: `1.5px solid ${isNext && !done ? T.accent : T.line}`,
        boxShadow: isNext && !done ? "0 10px 22px -18px rgba(90,66,160,.55)" : "none",
        transition: "background .15s, border-color .15s",
      }}
    >
      <Tick on={done} />
      <span style={{ flex: "none", width: 74, fontWeight: 800, fontSize: 12.5, color: done ? T.ink3 : T.accent }}>
        {row.label}
      </span>
      <span style={{
        flex: 1, fontWeight: 700, fontSize: 13.5, lineHeight: 1.4, minWidth: 0,
        color: done ? T.ink3 : T.ink, textDecoration: done ? "line-through" : "none",
      }}>
        {row.text}
      </span>
      <span style={{
        flex: "none", fontWeight: 800, fontSize: 12, color: T.muted,
        background: T.bg, border: `1px solid ${T.line}`, borderRadius: 999, padding: "4px 9px",
      }}>
        ({row.count})
      </span>
    </button>
  );
};

/**
 * @param onBack        return to the try screen
 * @param onStartReal   the starter path (tryFork("starter") in Auth.jsx)
 * @param onImportOwn   the import path (tryFork("import") in Auth.jsx)
 * @param onSignIn      existing-account link
 */
export default function GuestDemo({ onBack, onStartReal, onImportOwn, onSignIn }) {
  const [doneIds, setDoneIds] = useState(() => new Set());
  // Guards the one-per-screen "they actually touched it" signal, so the first
  // tap stays countable no matter how many follow it.
  const firstTapSent = useRef(false);

  useEffect(() => {
    try { posthog.capture("demo_shown", { pattern: "button_the_mushroom" }); } catch {}
  }, []);

  const doneCount = doneIds.size;
  const pct = Math.round((doneCount / TOTAL) * 100);
  // "Next" is the first unticked row, so the screen always points at something
  // without the visitor having to work out where they are.
  const nextIdx = DEMO_ROWS.findIndex(r => !doneIds.has(r.id));
  const stitches = doneCount > 0
    ? DEMO_ROWS[DEMO_ROWS.map(r => doneIds.has(r.id)).lastIndexOf(true)]?.count
    : 0;

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
        posthog.capture("demo_row_tapped", { first: true, row: row.label, row_index: idx });
        // The first tap is the moment a stranger stops reading and starts
        // using the product. It is rare, it means something, and it is one of
        // the six things allowed to interrupt Adam. Later taps digest.
        pulse("demo_started", { row_index: idx });
      } else if (nowDone) {
        posthog.capture("demo_row_tapped", { first: false, row: row.label, row_index: idx });
      }
    } catch {}
  };

  const convert = (to, fn) => {
    try { posthog.capture("demo_converted", { to, rows_done: doneIds.size }); } catch {}
    pulse("demo_converted", { to, rows_done: doneIds.size });
    fn();
  };

  const started = doneCount > 0;

  return (
    <div style={{
      maxWidth: 660, margin: "0 auto", width: "100%", boxSizing: "border-box",
      padding: "22px 18px 40px", fontFamily: T.body,
    }}>
      <button
        type="button"
        onClick={onBack}
        style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 13, fontWeight: 800, fontFamily: T.body, padding: 0, marginBottom: 14 }}
      >
        ← Back
      </button>

      {/* ── Pattern head: cover, title, and the honest label on the whole screen ── */}
      <div style={{
        background: "#fff", border: `1px solid ${T.line}`, borderRadius: 22,
        boxShadow: T.shadowLg, padding: 16, display: "flex", gap: 14, alignItems: "center",
      }}>
        <img
          src={COVER}
          alt="Button the Mushroom, a small crocheted toadstool"
          style={{ width: 74, height: 74, borderRadius: 16, objectFit: "cover", flex: "none", background: T.soft }}
        />
        <div style={{ minWidth: 0 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 6, background: T.soft, color: T.accentD,
            borderRadius: 999, padding: "4px 10px", fontWeight: 800, fontSize: 10.5,
            letterSpacing: ".08em", textTransform: "uppercase",
          }}>
            Demo · nothing is saved
          </div>
          <div style={{ fontFamily: T.disp, fontWeight: 600, fontSize: 21, color: T.ink, marginTop: 6, lineHeight: 1.15 }}>
            Button the Mushroom
          </div>
          <div style={{ fontWeight: 700, fontSize: 12.5, color: T.muted, marginTop: 4, lineHeight: 1.45 }}>
            The Cap, worked from the top down. Tap a round to tick it off.
          </div>
        </div>
      </div>

      {/* ── The counter. This is the bit that has to move when they tap. ── */}
      <div style={{
        background: "#fff", border: `1px solid ${T.line}`, borderRadius: 22,
        boxShadow: T.shadowLg, padding: "16px 18px", marginTop: 12,
      }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontFamily: T.disp, fontWeight: 600, fontSize: 22, color: T.ink }}>
            Round {doneCount} of {TOTAL}
          </div>
          <div style={{ fontWeight: 800, fontSize: 13, color: T.accent, marginLeft: "auto" }}>{pct}%</div>
        </div>
        <div style={{ height: 9, borderRadius: 99, background: T.line, overflow: "hidden", marginTop: 10 }}>
          <div style={{
            height: "100%", width: `${pct}%`, borderRadius: 99,
            background: `linear-gradient(90deg, ${T.accent}, ${T.pink})`,
            transition: "width .25s ease",
          }} />
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 11, fontWeight: 700, fontSize: 12.5, color: T.muted }}>
          <span>{stitches > 0 ? `${stitches} stitches on your hook` : "Nothing ticked yet"}</span>
          <span style={{ color: T.success, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3.2l7 3v4.8c0 4.4-3 7.4-7 8.8-4-1.4-7-4.4-7-8.8V6.2z" /><path d="M9 12l2 2 4-4.2" /></svg>
            BevCheck: every round adds up
          </span>
        </div>
      </div>

      {/* ── The rows ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
        {DEMO_ROWS.map((row, i) => (
          <DemoRow
            key={row.id}
            row={row}
            done={doneIds.has(row.id)}
            isNext={i === nextIdx}
            onToggle={() => toggle(row, i)}
          />
        ))}
      </div>

      <div style={{ fontWeight: 700, fontSize: 12.5, color: T.muted, marginTop: 12, lineHeight: 1.5 }}>
        Then the Stem, five more rounds, and the assembly. The real pattern carries
        the materials list, the chart and the photos with it.
      </div>

      {/* ── The way onward. Both paths are the same ones the try screen ran. ── */}
      <div style={{
        background: T.soft, border: `1px solid #E2DAF6`, borderRadius: 22,
        padding: 20, marginTop: 22,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <img src="/bev-sm.png" alt="Bev" style={{ width: 42, height: 42, borderRadius: "50%", flex: "none", border: "2.5px solid #fff", boxShadow: "0 6px 14px -6px rgba(90,66,160,.5)" }} />
          <div style={{ fontFamily: T.disp, fontWeight: 600, fontSize: 18, color: T.ink, lineHeight: 1.2 }}>
            {started ? "That is the whole idea" : "Ready when you are"}
          </div>
        </div>
        <p style={{ fontWeight: 700, fontSize: 13.5, color: T.muted, lineHeight: 1.55, margin: "11px 0 16px" }}>
          {started
            ? "Ticking rows here is a demo, so it resets when you leave. Start it for real and your place is kept, on every device you pick up."
            : "Nothing on this screen is saved. Start it for real and your place is kept, on every device you pick up."}
        </p>
        <div style={{ margin: "0 0 16px" }}>
          <GuestEmailAsk compact where="demo_end" align="left" />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button
            type="button"
            onClick={() => convert("starter", onStartReal)}
            style={{
              border: 0, borderRadius: 14, padding: "14px 22px", background: T.accent, color: "#fff",
              fontFamily: T.body, fontWeight: 800, fontSize: 15, cursor: "pointer",
              boxShadow: `0 16px 30px -14px ${T.accent}`,
            }}
          >
            Start this one for real
          </button>
          <button
            type="button"
            onClick={() => convert("import", onImportOwn)}
            style={{
              border: `1.5px solid ${T.line}`, borderRadius: 14, padding: "14px 22px", background: "#fff",
              color: T.ink, fontFamily: T.body, fontWeight: 800, fontSize: 15, cursor: "pointer",
            }}
          >
            Bring in my own pattern
          </button>
        </div>
        <div style={{ fontWeight: 700, fontSize: 12.5, color: T.muted, marginTop: 14, lineHeight: 1.5 }}>
          Still no account, still no card. Already have one?{" "}
          <a
            onClick={onSignIn}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSignIn(e); } }}
            style={{ fontWeight: 800, color: T.accent, cursor: "pointer", whiteSpace: "nowrap" }}
          >
            Sign in
          </a>
        </div>
      </div>
    </div>
  );
}
