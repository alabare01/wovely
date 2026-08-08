// ─── /crochet-stitch-counter — DOES THIS ROUND ADD UP? ───────────────────────
//
// Same evidence as the other two pages: a mechanical job people do by hand.
// When an amigurumi round does not come out to the stated count, the maker
// recounts the round below, then recounts the round itself, then starts again.
// Two numbers settle it — what the round PRODUCES and what it CONSUMES — and
// nothing on the web gives you both.
//
// This page refuses to guess. An unparsed term is reported, not silently
// dropped, because a stitch count that is confidently wrong costs more than no
// stitch count at all.

import { useState, useMemo } from "react";
import { T, useBreakpoint } from "./theme.jsx";
import PublicPage, { CARD, LABEL, useJsonLd } from "./components/PublicPage.jsx";
import { countRound } from "./utils/crochetTerms.js";

const EXAMPLES = [
  "Rnd 6: (sc 4, inc) x 6 (36)",
  "Rnd 7: (sc 5, inc) x 6 (48)",
  "Rnd 12: (sc 4, dec) x 6 (30)",
  "[2 dc, ch 1] 8 times",
  "sc in next 6 sts, inc, sc in next 6 sts",
];

export default function StitchCounter() {
  const { isMobile } = useBreakpoint();
  const [text, setText] = useState(EXAMPLES[0]);
  const r = useMemo(() => countRound(text), [text]);

  useJsonLd({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Crochet Stitch Count Checker",
    url: "https://wovely.app/crochet-stitch-counter",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description:
      "Paste a written crochet round and see how many stitches it makes and how many it works across, so you can find where a count stopped adding up.",
  });

  const hasResult = r.produces > 0 || r.consumes > 0;

  return (
    <PublicPage
      path="/crochet-stitch-counter"
      h1="Crochet stitch count checker"
      intro={
        <>
          Paste one written round and see two numbers: how many stitches it makes, and how many
          stitches of the round below it uses up. When a pattern stops adding up, the disagreement
          between those two is where it went wrong.
        </>
      }
    >
      <div style={{ ...CARD, padding: isMobile ? 18 : 26 }}>
        <div style={{ ...LABEL, marginBottom: 8 }}>The round, exactly as the pattern writes it</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={2}
          placeholder="Rnd 6: (sc 4, inc) x 6 (36)"
          style={{
            width: "100%", padding: 15, borderRadius: 16,
            border: `1.5px solid ${T.line}`, background: "#fff", color: T.ink,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 15, lineHeight: 1.7, resize: "vertical", outline: "none",
          }}
          onFocus={(e) => (e.target.style.borderColor = T.accent)}
          onBlur={(e) => (e.target.style.borderColor = T.line)}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => setText(ex)} style={{
              padding: "7px 13px", borderRadius: 999, border: `1px solid ${T.line}`,
              background: text === ex ? T.soft : "#fff", color: T.muted, cursor: "pointer",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 600, fontSize: 12,
            }}>{ex.replace(/^Rnd \d+: /, "")}</button>
          ))}
        </div>

        {/* results */}
        {r.unresolved ? (
          <Note tone="warn">
            This round repeats <b>an unstated number of times</b> (“repeat from * around”), so the
            total depends on how many stitches the previous round had. Replace the word around with
            the number of repeats and the count will resolve.
          </Note>
        ) : !hasResult ? (
          <Note tone="quiet">
            Nothing countable read yet. Write the round the way the pattern does, for example{" "}
            <b>(sc 4, inc) x 6</b>.
          </Note>
        ) : (
          <>
            <div style={{
              display: "grid", gap: 12, marginTop: 18,
              gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr",
            }}>
              <Stat label="Stitches made" value={r.produces} big accent />
              <Stat label="Worked across" value={r.consumes} sub="stitches from the round below" />
              {r.chains > 0 && <Stat label="Chains" value={r.chains} sub="not counted as stitches" />}
            </div>

            {/* the arithmetic, spelled out */}
            {r.groups.filter((g) => g.resolved).length > 0 && (
              <div style={{
                marginTop: 14, padding: "14px 16px", borderRadius: 14,
                background: T.linen, border: `1px solid ${T.line}`,
                fontFamily: T.body, fontSize: 14, lineHeight: 1.8, color: T.ink, fontWeight: 600,
              }}>
                {r.groups.filter((g) => g.resolved).map((g, i) => (
                  <div key={i}>
                    <code style={{ color: T.accentD, fontWeight: 700 }}>({g.inner})</code> makes{" "}
                    <b>{g.perRepeat}</b> {g.perRepeat === 1 ? "stitch" : "stitches"} across{" "}
                    <b>{g.consumesPerRepeat}</b>, repeated <b>{g.reps}</b> times ={" "}
                    <b style={{ color: T.accent }}>{g.perRepeat * g.reps}</b> made over{" "}
                    <b>{g.consumesPerRepeat * g.reps}</b>.
                  </div>
                ))}
              </div>
            )}

            {/* against the pattern's own stated count */}
            {r.stated !== null && r.stated !== undefined && (
              r.matchesStated ? (
                <Note tone="ok">
                  The pattern states <b>({r.stated})</b> and the round works out to <b>{r.produces}</b>.
                  They agree, so this round is not where your count went wrong.
                </Note>
              ) : (
                <Note tone="warn">
                  The pattern states <b>({r.stated})</b> but the instructions work out to{" "}
                  <b>{r.produces}</b>. One of the two is wrong. Before assuming it is a typo, check
                  that you read the repeat count correctly, and that the previous round really
                  finished with <b>{r.consumes}</b> stitches.
                </Note>
              )
            )}

            {r.unknown.length > 0 && (
              <Note tone="quiet">
                Not counted, because these were not recognised:{" "}
                {r.unknown.map((u, i) => (
                  <span key={i}>{i > 0 && ", "}<b>{u.trim()}</b></span>
                ))}. The totals above exclude them, so treat them as a minimum rather than an answer.
              </Note>
            )}
          </>
        )}
      </div>

      <Section title="How to read the two numbers">
        <p style={P}>
          Every round has an input and an output. <b>Worked across</b> is the input: how many
          stitches of the previous round this one consumes. <b>Stitches made</b> is the output: how
          many you will have when the round is finished, and the number the pattern puts in brackets
          at the end.
        </p>
        <p style={P}>
          A plain stitch takes one and makes one, so those two numbers match and the count holds
          steady. An increase takes one and makes two. A decrease takes two and makes one. Every
          shaping round is just those three facts added up.
        </p>
        <p style={{ ...P, marginBottom: 0 }}>
          That is why the input number is the useful one. If a round will not come out right, the
          usual cause is not the round you are staring at but the one before it, which finished with
          a different number of stitches than you thought. Checking what this round needs to be
          worked across tells you immediately which round to go back and recount.
        </p>
      </Section>

      <Section title="What it can and cannot read">
        <ul style={{ margin: 0, paddingLeft: 22 }}>
          <li style={{ ...P, marginBottom: 10 }}>
            <b>It reads</b> bracketed repeats such as <Code>(sc 4, inc) x 6</Code> and{" "}
            <Code>[2 dc, ch 1] 8 times</Code>, asterisk repeats with a stated number, counts written
            either way round (<Code>sc 4</Code> or <Code>4 sc</Code>), the <Code>N in next st</Code>{" "}
            increase form, and the <Code>2tog</Code> decrease family.
          </li>
          <li style={{ ...P, marginBottom: 10 }}>
            <b>It does not read</b> a repeat with no number on it. “Repeat from * around” depends on
            the round below, which this page has not been given.
          </li>
          <li style={{ ...P, marginBottom: 10 }}>
            <b>Chains are reported separately.</b> A chain is not a stitch of the round in the sense
            the bracketed count means, and mixing them in is a common reason a lace round appears
            not to add up when it is fine.
          </li>
          <li style={{ ...P, marginBottom: 0 }}>
            <b>Anything it cannot parse is listed, not ignored.</b> If a term appears in that list,
            the totals above it are incomplete and it says so.
          </li>
        </ul>
      </Section>
    </PublicPage>
  );
}

const P = { fontFamily: T.body, fontSize: 15.5, lineHeight: 1.75, color: T.ink, margin: "0 0 14px" };

const Code = ({ children }) => (
  <code style={{
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.92em",
    background: T.soft, color: T.accentD, padding: "1px 6px", borderRadius: 6, fontWeight: 700,
  }}>{children}</code>
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

const Stat = ({ label, value, sub, big, accent }) => (
  <div style={{
    padding: "16px 14px", borderRadius: 16, textAlign: "center",
    background: accent ? T.soft : T.linen,
    border: `1px solid ${accent ? "#E2DAF6" : T.line}`,
  }}>
    <div style={{ ...LABEL, fontSize: 10, marginBottom: 6 }}>{label}</div>
    <div style={{
      fontFamily: T.disp, fontWeight: 700, fontSize: big ? 40 : 32,
      color: accent ? T.accent : T.ink, lineHeight: 1,
    }}>{value}</div>
    {sub && <div style={{ fontFamily: T.body, fontSize: 11.5, color: T.muted, marginTop: 6, fontWeight: 600, lineHeight: 1.4 }}>{sub}</div>}
  </div>
);

const TONES = {
  ok:    { background: "#E7F6F0", border: "1px solid #C4E9DC", color: "#14614A" },
  warn:  { background: "#FFF8E8", border: "1px solid #F5E2B8", color: "#7A5A15" },
  quiet: { background: T.linen,   border: `1px solid ${T.line}`, color: T.muted },
};

const Note = ({ tone = "quiet", children }) => (
  <div style={{
    ...TONES[tone], marginTop: 14, borderRadius: 14, padding: "13px 16px",
    fontFamily: T.body, fontSize: 14, lineHeight: 1.68, fontWeight: 600,
  }}>{children}</div>
);
