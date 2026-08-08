// ─── /uk-us-crochet-terms — WHOLE-PATTERN UK ⇄ US CONVERTER ──────────────────
//
// Nine pages rank for this query and every one of them is a static chart whose
// closing instruction is "now work through your pattern and replace every
// abbreviation by hand." This page does the replacing. The chart is still here,
// lower down, because some visitors genuinely do want the chart.

import { useState, useMemo, useRef } from "react";
import { T, useBreakpoint } from "./theme.jsx";
import PublicPage, { CARD, LABEL, useJsonLd } from "./components/PublicPage.jsx";
import { convertPattern, detectDialect, STITCH_LADDER, VOCAB_PAIRS } from "./utils/crochetTerms.js";

const EXAMPLE_UK = `Round 1: 6 dc into a magic ring. (6)
Round 2: 2 dc in ea st around. (12)
Round 3: *1 dc, 2 dc in next st; rep from * around. (18)
Round 4: ch 3, 2 tr in next st, miss 1 st, 1 htr in next st.
Round 5: 1 dtr in next st, tr2tog, ss to join.
Tension: 16 sts and 18 rows to 10cm.`;

const EXAMPLE_US = `Round 1: 6 sc into a magic ring. (6)
Round 2: 2 sc in ea st around. (12)
Round 3: *1 sc, 2 sc in next st; rep from * around. (18)
Round 4: ch 3, 2 dc in next st, sk 1 st, 1 hdc in next st.
Round 5: 1 tr in next st, dc2tog, sl st to join.
Gauge: 16 sts and 18 rows to 10cm.`;

export default function UkUsConverter() {
  const { isMobile } = useBreakpoint();
  const [text, setText] = useState(EXAMPLE_UK);
  // null = follow detection; "uk-to-us"/"us-to-uk" = the reader overrode it.
  const [override, setOverride] = useState(null);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef(null);

  const detection = useMemo(() => detectDialect(text), [text]);
  const direction = override || (detection.dialect === "us" ? "us-to-uk" : "uk-to-us");
  const result = useMemo(() => convertPattern(text, direction), [text, direction]);

  const ukToUs = direction === "uk-to-us";
  const fromLabel = ukToUs ? "UK" : "US";
  const toLabel = ukToUs ? "US" : "UK";

  // The reader's own choice disagrees with what the text looks like. Say so
  // rather than silently converting in a direction that will wreck the pattern.
  const mismatch =
    override && detection.confident &&
    ((detection.dialect === "uk" && direction === "us-to-uk") ||
     (detection.dialect === "us" && direction === "uk-to-us"));

  const copy = () => {
    const done = () => {
      setCopied(true);
      clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(result.outputText).then(done).catch(() => {});
    } else {
      // Older iOS Safari over http, and any context without the async API.
      const ta = document.createElement("textarea");
      ta.value = result.outputText;
      ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch {}
      ta.remove();
    }
  };

  useJsonLd({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "UK to US Crochet Term Converter",
    url: "https://wovely.app/uk-us-crochet-terms",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description:
      "Paste a whole crochet pattern and convert every UK abbreviation to its US equivalent in one pass, or convert US terms to UK.",
  });

  const btn = (on) => ({
    flex: 1, padding: "11px 14px", borderRadius: 999, border: "none", cursor: "pointer",
    background: on ? `linear-gradient(180deg, ${T.accent}, ${T.accentD})` : "transparent",
    color: on ? "#fff" : T.muted,
    fontFamily: T.body, fontWeight: 800, fontSize: 13.5, transition: "all .15s",
  });

  return (
    <PublicPage
      path="/uk-us-crochet-terms"
      h1="UK to US crochet term converter"
      intro={
        <>
          Paste a whole pattern and convert every term at once. Nothing is uploaded and
          nothing is saved: the conversion runs in your browser, so you can paste a
          pattern you paid for without it leaving your device.
        </>
      }
    >
      {/* ── THE TOOL ── */}
      <div style={{ ...CARD, padding: isMobile ? 18 : 26 }}>
        <div style={{ display: "flex", gap: 4, background: T.soft, borderRadius: 999, padding: 4, marginBottom: 16 }}>
          <button style={btn(ukToUs)} onClick={() => setOverride("uk-to-us")}>UK → US</button>
          <button style={btn(!ukToUs)} onClick={() => setOverride("us-to-uk")}>US → UK</button>
        </div>

        {/* Detection read-out. Evidence, not a verdict. */}
        <DetectionNote detection={detection} override={override} mismatch={mismatch} direction={direction} />

        <div style={{
          display: "grid", gap: 16,
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", marginTop: 16,
        }}>
          {/* input */}
          <div>
            {/* minHeight keeps the two column headings on the same baseline:
                the left one holds a bare text link and the right one a pill
                button, and without it the two panels sat 6px out of step. */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8, minHeight: 30 }}>
              <div style={LABEL}>Your pattern ({fromLabel} terms)</div>
              <button
                onClick={() => setText("")}
                style={{ marginLeft: "auto", background: "none", border: "none", color: T.accent, cursor: "pointer", fontFamily: T.body, fontWeight: 700, fontSize: 12 }}
              >Clear</button>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder={"Paste your whole pattern here.\n\nRound 1: 6 dc into a magic ring."}
              style={{
                width: "100%", minHeight: 260, padding: 16, borderRadius: 16,
                border: `1.5px solid ${T.line}`, background: "#fff", color: T.ink,
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: 14, lineHeight: 1.7, resize: "vertical", outline: "none",
              }}
              onFocus={(e) => (e.target.style.borderColor = T.accent)}
              onBlur={(e) => (e.target.style.borderColor = T.line)}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <MiniBtn onClick={() => { setText(EXAMPLE_UK); setOverride(null); }}>Load a UK example</MiniBtn>
              <MiniBtn onClick={() => { setText(EXAMPLE_US); setOverride(null); }}>Load a US example</MiniBtn>
            </div>
          </div>

          {/* output */}
          <div>
            {/* minHeight keeps the two column headings on the same baseline:
                the left one holds a bare text link and the right one a pill
                button, and without it the two panels sat 6px out of step. */}
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8, minHeight: 30 }}>
              <div style={LABEL}>Converted ({toLabel} terms)</div>
              {result.outputText && (
                <button
                  onClick={copy}
                  style={{
                    marginLeft: "auto", padding: "6px 14px", borderRadius: 999,
                    border: `1px solid ${copied ? T.mint : T.line}`,
                    background: copied ? "#E7F6F0" : "#fff",
                    color: copied ? T.success : T.accent, cursor: "pointer",
                    fontFamily: T.body, fontWeight: 800, fontSize: 12,
                  }}
                >{copied ? "Copied" : "Copy"}</button>
              )}
            </div>
            <div style={{
              minHeight: 260, padding: 16, borderRadius: 16,
              border: `1.5px solid ${T.line}`, background: T.linen,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 14, lineHeight: 1.7, whiteSpace: "pre-wrap",
              wordBreak: "break-word", color: T.ink,
            }}>
              {text.trim()
                ? result.segments.map((s, i) =>
                    s.changed ? (
                      <mark key={i} title={`${s.from} → ${s.text}`} style={{
                        background: "#EDE7FB", color: T.accentD,
                        fontWeight: 700, borderRadius: 4, padding: "1px 3px",
                      }}>{s.text}</mark>
                    ) : (
                      <span key={i}>{s.text}</span>
                    )
                  )
                : <span style={{ color: T.ink3, fontFamily: T.body }}>Your converted pattern appears here as you type.</span>}
            </div>
            {result.totalChanges > 0 && (
              <div style={{ marginTop: 10, fontFamily: T.body, fontSize: 13, color: T.muted, fontWeight: 600 }}>
                {result.totalChanges} {result.totalChanges === 1 ? "term" : "terms"} changed:{" "}
                {result.changes.slice(0, 8).map((c, i) => (
                  <span key={c.from}>
                    {i > 0 && ", "}
                    <b style={{ color: T.ink }}>{c.from}</b> → <b style={{ color: T.accent }}>{c.to}</b>
                    {c.n > 1 && <span style={{ color: T.ink3 }}> ×{c.n}</span>}
                  </span>
                ))}
                {result.changes.length > 8 && <span> and {result.changes.length - 8} more</span>}
              </div>
            )}
            {text.trim() && result.totalChanges === 0 && (
              <div style={{ marginTop: 10, fontFamily: T.body, fontSize: 13, color: T.muted, fontWeight: 600 }}>
                Nothing to change. No {fromLabel} terms were found in this text.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── WHY BY HAND GOES WRONG ── */}
      <Section title="Why doing this by hand goes wrong">
        <p style={P}>
          The two dialects do not use different abbreviations. They use the <b>same</b> abbreviations
          for different stitches. UK <Code>dc</Code> is US <Code>sc</Code>. US <Code>dc</Code> is
          UK <Code>tr</Code>. That overlap is the whole problem.
        </p>
        <p style={P}>
          Work down a UK pattern with a chart and you change every <Code>dc</Code> to <Code>sc</Code>.
          Then you reach a <Code>tr</Code> and change it to <Code>dc</Code>. Your pattern now contains
          two kinds of <Code>dc</Code>: the ones you already converted and the ones you just created.
          Go back over it and you convert the new ones a second time. One pass, done by a person,
          quietly corrupts the document.
        </p>
        <p style={{ ...P, marginBottom: 0 }}>
          This page reads every term once, maps it once and writes it once, so a converted stitch is
          never re-read. That is the only reason it is safe to run on a whole pattern at a time.
        </p>
      </Section>

      {/* ── THE CHART ── */}
      <Section title="UK to US crochet terms chart">
        <p style={{ ...P, marginBottom: 16 }}>
          The two stitch ladders are offset by exactly one rung. Every UK stitch name means the
          stitch one step shorter in US terms.
        </p>
        {/* Two columns on a phone, four on a desktop. The four-column version
            needs ~480px and was being cut off inside a horizontal scroller on
            mobile — and the column that fell off the right edge was the US one,
            which is the entire reason the reader is on this page. Stacking the
            abbreviation over its full name keeps both dialects fully visible at
            390px with no sideways scrolling. */}
        <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: T.body, fontSize: 14.5 }}>
          <thead>
            <tr>
              {isMobile
                ? <><Th>UK</Th><Th>US</Th></>
                : <><Th>UK term</Th><Th>UK abbr.</Th><Th>US term</Th><Th>US abbr.</Th></>}
            </tr>
          </thead>
          <tbody>
            {[...STITCH_LADDER, ...VOCAB_PAIRS].map((r) => (
              <tr key={r.us + r.uk} style={{ background: r.same ? T.linen : "transparent" }}>
                {isMobile ? (
                  <>
                    <Td><Pair abbr={r.uk} name={r.ukName} /></Td>
                    <Td><Pair abbr={r.us} name={r.usName} accent={!r.same} /></Td>
                  </>
                ) : (
                  <>
                    <Td>{r.ukName}</Td>
                    <Td mono>{r.uk}</Td>
                    <Td>{r.usName}</Td>
                    <Td mono accent={!r.same}>{r.us}</Td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ ...P, marginTop: 16, marginBottom: 0, fontSize: 14 }}>
          The two shaded rows are the stitches that mean the same thing in both dialects. Chain and
          slip stitch never change, which is why a pattern made only of those two gives you no clue
          which dialect it was written in.
        </p>
      </Section>

      {/* ── HONEST LIMITS ── */}
      <Section title="What this converter does not do">
        <ul style={{ margin: 0, paddingLeft: 22 }}>
          <Li>
            <b>It changes names, not instructions.</b> Stitch counts, repeats, row numbers and
            shaping are left exactly as written. A UK pattern converted to US terms is the same
            pattern, spelled differently.
          </Li>
          <Li>
            <b>It cannot read a picture.</b> If your pattern is a photo, a scan or a chart made of
            symbols, there is no text for it to convert. Paste the written rows.
          </Li>
          <Li>
            <b>It will not guess the direction for you when the text is ambiguous.</b> A row like
            <Code> 3 dc, ch 2, 3 dc</Code> is valid in both dialects and means two different things.
            When there is no unambiguous term anywhere in the text, the page says so and leaves the
            choice to you, because converting the wrong way round turns a granny square into
            something twice the height.
          </Li>
          <Li>
            <b>Post stitches assume the pattern is consistent.</b> Some designers writing in UK terms
            still use the US names for front and back post stitches. If your pattern does that, check
            those rows yourself.
          </Li>
        </ul>
      </Section>

      {/* ── FAQ ── */}
      <Section title="Common questions">
        <Faq q="How do I tell whether a pattern is written in UK or US terms?">
          Look for a term that only exists in one of them. <Code>htr</Code>, <Code>dtr</Code>,
          {" "}<Code>miss</Code> and <Code>tension</Code> only appear in UK patterns.{" "}
          <Code>sc</Code>, <Code>hdc</Code>, <Code>skip</Code> and <Code>gauge</Code> only appear in
          US ones. If the pattern uses <Code>sc</Code> anywhere, it is US. If it uses{" "}
          <Code>htr</Code> anywhere, it is UK. Paste it above and the page will point at whichever
          markers it found.
        </Faq>
        <Faq q="What is UK dc in US terms?">
          UK double crochet (<Code>dc</Code>) is US single crochet (<Code>sc</Code>). This is the
          single most common mix-up, because both dialects have a stitch abbreviated{" "}
          <Code>dc</Code> and they are two rungs apart in height.
        </Faq>
        <Faq q="Is a UK treble the same as a US treble?">
          No. UK treble (<Code>tr</Code>) is US double crochet (<Code>dc</Code>). US treble
          (<Code>tr</Code>) is UK double treble (<Code>dtr</Code>). The word treble appears in both
          ladders one rung apart, which is why it catches people out even more often than dc does.
        </Faq>
        <Faq q="Does the hook size or yarn change when I convert the terms?">
          No. Terminology and materials are unrelated. A UK pattern converted to US terms uses the
          same hook, the same yarn and the same tension. If your finished piece is coming out the
          wrong size, that is a gauge problem, not a terminology one.
        </Faq>
        <Faq q="Is my pattern uploaded anywhere?">
          No. The conversion runs entirely in your browser. Nothing is sent to a server, nothing is
          stored, and closing the tab discards it.
        </Faq>
      </Section>
    </PublicPage>
  );
}

// ── small presentational pieces ──────────────────────────────────────────────

const P = { fontFamily: T.body, fontSize: 15.5, lineHeight: 1.75, color: T.ink, margin: "0 0 14px" };

const Li = ({ children }) => (
  <li style={{ ...P, marginBottom: 12 }}>{children}</li>
);

const Code = ({ children }) => (
  <code style={{
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.92em",
    background: T.soft, color: T.accentD, padding: "1px 6px", borderRadius: 6, fontWeight: 700,
  }}>{children}</code>
);

const MiniBtn = ({ children, onClick }) => (
  <button onClick={onClick} style={{
    padding: "7px 13px", borderRadius: 999, border: `1px solid ${T.line}`,
    background: "#fff", color: T.muted, cursor: "pointer",
    fontFamily: T.body, fontWeight: 700, fontSize: 12,
  }}>{children}</button>
);

const Section = ({ title, children }) => {
  const { isMobile } = useBreakpoint();
  return (
    <div style={{ ...CARD, padding: isMobile ? 20 : 30, marginTop: 20 }}>
      <h2 style={{
        fontFamily: T.disp, fontWeight: 700, fontSize: isMobile ? 21 : 25,
        color: T.ink, margin: "0 0 14px", lineHeight: 1.25,
      }}>{title}</h2>
      {children}
    </div>
  );
};

const Th = ({ children }) => (
  <th style={{
    textAlign: "left", padding: "10px 12px", borderBottom: `2px solid ${T.line}`,
    ...LABEL, fontSize: 10.5,
  }}>{children}</th>
);

const Td = ({ children, mono, accent }) => (
  <td style={{
    padding: "11px 12px", borderBottom: `1px solid ${T.line}`,
    color: accent ? T.accentD : T.ink,
    fontWeight: mono ? 700 : 500,
    fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : T.body,
  }}>{children}</td>
);

/** Mobile chart cell: abbreviation over its full name. */
const Pair = ({ abbr, name, accent }) => (
  <div>
    <div style={{
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontWeight: 700, fontSize: 14.5, color: accent ? T.accentD : T.ink,
    }}>{abbr}</div>
    <div style={{ fontFamily: T.body, fontSize: 12.5, color: T.muted, fontWeight: 600, marginTop: 2 }}>{name}</div>
  </div>
);

const Faq = ({ q, children }) => (
  <div style={{ marginBottom: 20 }}>
    <h3 style={{ fontFamily: T.disp, fontWeight: 600, fontSize: 17, color: T.ink, margin: "0 0 7px" }}>{q}</h3>
    <p style={{ ...P, margin: 0 }}>{children}</p>
  </div>
);

/** Shows what the detector actually found, so the reader can overrule it. */
const DetectionNote = ({ detection, override, mismatch, direction }) => {
  const base = {
    borderRadius: 14, padding: "12px 15px",
    fontFamily: T.body, fontSize: 13.5, lineHeight: 1.6, fontWeight: 600,
  };

  if (mismatch) {
    return (
      <div style={{ ...base, background: "#FDF1EF", border: "1px solid #F6D9D3", color: "#8E3B2E" }}>
        Heads up: this text reads as a <b>{detection.dialect.toUpperCase()}</b> pattern
        {detection.dialect === "uk" ? ` (found ${detection.ukHits.slice(0, 3).join(", ")})` : ` (found ${detection.usHits.slice(0, 3).join(", ")})`},
        but you have asked for {direction === "uk-to-us" ? "UK → US" : "US → UK"}. Converting the
        wrong way round will change every stitch height. Switch the toggle if that was not deliberate.
      </div>
    );
  }

  if (detection.dialect === "unknown" && detection.ambiguous) {
    return (
      <div style={{ ...base, background: "#FFF8E8", border: "1px solid #F5E2B8", color: "#7A5A15" }}>
        This text only uses abbreviations that exist in <b>both</b> dialects, so there is no way to
        tell which one it was written in. Check the pattern for the words tension, miss, htr or dtr
        (UK) or gauge, skip, sc or hdc (US), then set the direction yourself above.
      </div>
    );
  }

  if (detection.dialect === "unknown") return null;

  const hits = detection.dialect === "uk" ? detection.ukHits : detection.usHits;
  return (
    <div style={{ ...base, background: "#E7F6F0", border: "1px solid #C4E9DC", color: "#14614A" }}>
      Reads as a <b>{detection.dialect.toUpperCase()}</b> pattern
      {hits.length > 0 && <> because it uses {hits.slice(0, 4).map((h, i) => <span key={h}>{i > 0 && ", "}<b>{h}</b></span>)}</>}.
      {!override && " Direction set automatically; change it above if that is wrong."}
    </div>
  );
};
