// ─── /crochet-stitch-counter — DOES THIS ROUND ADD UP? ───────────────────────
//
// Two things had to be true of this page at once, and the first version was
// neither.
//
// 1. IT MUST BE CORRECT. A stitch count that is confidently wrong is worse than
//    no stitch count. The old parser answered "sc in each st around" — the most
//    common round in crochet — with "1 stitch made" behind a clean green panel.
//    The engine now refuses to show a number unless it has read every term in
//    the round, and says plainly which term stopped it when it has not.
//
// 2. IT MUST NOT GIVE AWAY THE PRODUCT. Verification is the paid thing. So the
//    free tool here is deliberately scoped to ONE round of arithmetic, which is
//    what the search query actually asks for, and it stops at exactly the point
//    where the real work starts: checking a whole pattern, round against round,
//    so that what each round consumes matches what the one before it made. Paste
//    more than one round and the page says so and hands you to Wovely rather
//    than quietly doing half the job for free.
//
// The boundary is drawn by SCOPE, not by a counter of free uses. A usage cap on
// a page whose entire purpose is to be the best answer to a search result is
// both trivially bypassed and hostile to the visitor it was built to win.

import { useState, useMemo } from "react";
import { T, useBreakpoint } from "./theme.jsx";
import PublicPage, { CARD, LABEL, useJsonLd } from "./components/PublicPage.jsx";
import { countRound } from "./utils/crochetTerms.js";

const EXAMPLES = [
  "Rnd 6: (sc 4, inc) x 6 (36)",
  "Rnd 12: (sc 4, dec) x 6 (30)",
  "6 sc in magic ring",
  "sc in each st around",
  "[2 dc, ch 1] 8 times",
];

// Exported so the build can write this same block into the page's raw HTML
// head (scripts/prerender.mjs). A crawler that does not run JavaScript was
// getting no structured data at all, because useJsonLd runs in an effect.
export const PAGE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Crochet Stitch Count Checker",
  url: "https://wovely.app/crochet-stitch-counter",
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Check one written crochet round: how many stitches it makes, how many it works across, and whether that agrees with the count the pattern states.",
};

export default function StitchCounter() {
  const { isMobile } = useBreakpoint();
  const [text, setText] = useState(EXAMPLES[0]);
  const [prev, setPrev] = useState("");

  const r = useMemo(
    () => countRound(text, { prevCount: prev === "" ? null : Number(prev) }),
    [text, prev]
  );

  useJsonLd(PAGE_SCHEMA);

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
      closer={{
        title: "One round is arithmetic. A pattern is a chain of them.",
        body:
          "This page checks the round in front of you. What it cannot tell you is whether the pattern holds together across all of them, which is where a miscounted pattern really goes wrong and why a bad round can sit undetected for an hour of work. Wovely reads a whole pattern at once and checks that the rounds run in sequence with none missing or duplicated, that the count each round states matches the instructions that produce it, and that nothing refers to a round that is not there.",
        cta: "See how Wovely checks a pattern",
        note: "Free to start, no card",
      }}
    >
      <div style={{ ...CARD, padding: isMobile ? 18 : 26 }}>
        <div style={{ ...LABEL, marginBottom: 8 }}>One round, exactly as the pattern writes it</div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          rows={2}
          placeholder="Rnd 6: (sc 4, inc) x 6 (36)"
          style={{
            width: "100%", maxWidth: "100%", padding: 15, borderRadius: 16,
            border: `1.5px solid ${T.line}`, background: "#fff", color: T.ink,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 15, lineHeight: 1.7, resize: "vertical", outline: "none",
          }}
          onFocus={(e) => (e.target.style.borderColor = T.accent)}
          onBlur={(e) => (e.target.style.borderColor = T.line)}
        />

        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {EXAMPLES.map((ex) => (
            <button key={ex} onClick={() => { setText(ex); setPrev(""); }} style={{
              padding: "7px 13px", borderRadius: 999, border: `1px solid ${T.line}`,
              background: text === ex ? T.soft : "#fff", color: T.muted, cursor: "pointer",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontWeight: 600,
              fontSize: 12, maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>{ex.replace(/^Rnd \d+: /, "")}</button>
          ))}
        </div>

        {/* The previous round's count. Only asked for when the round in the box
            actually depends on it, because a field that is usually irrelevant
            gets filled in wrongly and then trusted. */}
        {r.dependsOnPrevious && !r.mixedDependent && (
          <div style={{
            marginTop: 14, padding: "14px 16px", borderRadius: 14,
            background: T.soft, border: "1px solid #E2DAF6",
          }}>
            <label htmlFor="prev-count" style={{ ...LABEL, display: "block", marginBottom: 8 }}>
              How many stitches did the round below finish with?
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <input
                id="prev-count"
                type="number"
                inputMode="numeric"
                min="1"
                value={prev}
                onChange={(e) => setPrev(e.target.value)}
                placeholder="36"
                style={{
                  width: 110, maxWidth: "100%", padding: "11px 14px", borderRadius: 12,
                  border: `1.5px solid ${T.line}`, background: "#fff", color: T.ink,
                  fontFamily: T.body, fontSize: 16, fontWeight: 700, outline: "none",
                }}
                onFocus={(e) => (e.target.style.borderColor = T.accent)}
                onBlur={(e) => (e.target.style.borderColor = T.line)}
              />
              <span style={{ fontFamily: T.body, fontSize: 13.5, color: T.muted, fontWeight: 600, flex: 1, minWidth: 180 }}>
                This round works into every stitch of the one below, so its total is whatever that
                round finished with. There is no way to know it from this round alone.
              </span>
            </div>
          </div>
        )}

        {r.empty ? (
          <Note tone="quiet">
            Write the round the way the pattern does, for example <b>(sc 4, inc) x 6</b>.
          </Note>
        ) : r.confident ? (
          <Result r={r} isMobile={isMobile} />
        ) : (
          <Refusal r={r} />
        )}
      </div>

      {/* ── THE HONEST BOUNDARY ── */}
      <Section title="Where this page stops">
        <p style={P}>
          Everything above is arithmetic on one round, and arithmetic is the easy half. The half that
          actually costs people an evening is continuity: whether round 14 is worked across the
          number round 13 really finished with, all the way down a pattern. A round can be perfectly
          correct on its own and still be impossible, because the round above it did not leave the
          right number of stitches to work into.
        </p>
        <p style={P}>
          That is why a pattern gets read end to end before it is trusted, one round against the
          next, with every stated count reconciled against the instructions that produce it. It is
          the job a technical editor does on a pattern before it is published, and it is not
          something a single text box can do for you.
        </p>
        <p style={{ ...P, marginBottom: 0 }}>
          Wovely does that work on a whole pattern: rounds in sequence with none missing or
          duplicated, every stated count reconciled against the instructions that produce it, and no
          reference to a round that is not there. This page will always check one round for free,
          because that is what you came here for.
        </p>
      </Section>

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

      <Section title="What it reads, and what it refuses">
        <ul style={{ margin: 0, paddingLeft: 22 }}>
          <li style={{ ...P, marginBottom: 10 }}>
            <b>It reads</b> bracketed repeats such as <Code>(sc 4, inc) x 6</Code> and{" "}
            <Code>[2 dc, ch 1] 8 times</Code>, asterisk repeats with a stated number, counts written
            either way round (<Code>sc 4</Code> or <Code>4 sc</Code>), the{" "}
            <Code>N in next st</Code> increase form, <Code>in next N sts</Code>,{" "}
            <Code>in each of the next N sts</Code>, the <Code>2tog</Code> decrease family, skips,
            back and front loop placement, and stitches worked into a magic ring or a chain space.
          </li>
          <li style={{ ...P, marginBottom: 10 }}>
            <b>A magic ring makes stitches out of nothing.</b> <Code>6 sc in magic ring</Code> makes
            six and works across zero, because there is no round below it to use up. The same goes
            for a stitch worked into a chain space rather than into a stitch.
          </li>
          <li style={{ ...P, marginBottom: 10 }}>
            <b>Every stitch around depends on the round below.</b>{" "}
            <Code>sc in each st around</Code> makes exactly as many stitches as the previous round
            finished with. It is not one stitch, and it is not a guess. The page asks you for that
            number and then answers exactly.
          </li>
          <li style={{ ...P, marginBottom: 10 }}>
            <b>Chains are reported separately.</b> A chain is not a stitch of the round in the sense
            the bracketed count means, and mixing them in is a common reason a lace round appears
            not to add up when it is fine.
          </li>
          <li style={{ ...P, marginBottom: 0 }}>
            <b>If it cannot read a term, you get no number at all.</b> Not a number with a footnote,
            and not a total that quietly skipped part of the round. The term it could not read is
            named and the result is withheld, because a count that is confidently wrong sends you
            back to unpick work that was correct.
          </li>
        </ul>
      </Section>

      <Section title="Common questions">
        <Faq q="Why will it not just give me a number for every round?">
          Because a number you cannot trust is worse than no number. If the page cannot read one
          term of a round, its total is missing whatever that term produced, and you have no way of
          knowing by how much. A total that is silently short is the failure that sends you back
          through work that was already correct.
        </Faq>
        <Faq q="My round does not match the count the pattern states. Which one is wrong?">
          Check the worked-across figure first. If it does not match what the previous round
          finished with, the pattern is not the problem and the round below is where to recount.
          If it does match, then either the repeat count or the stated total in brackets is a typo,
          and the arithmetic above tells you which of the two the instructions actually support.
        </Faq>
        <Faq q="Can I paste my whole pattern in?">
          Not here. This page checks one round at a time, which is a different job from reading a
          pattern end to end and reconciling every round in it against the counts it states. That
          second job is what Wovely does.
        </Faq>
        <Faq q="Does it work on UK patterns?">
          The arithmetic does. A UK htr and a US hdc both take one stitch and make one, so the two
          numbers come out the same either way. If you want the terms themselves converted, the{" "}
          <a href="/uk-us-crochet-terms" style={{ color: T.accent, fontWeight: 700 }}>
            UK to US converter
          </a>{" "}
          will do a whole pattern at once.
        </Faq>
      </Section>
    </PublicPage>
  );
}

// ── result and refusal ───────────────────────────────────────────────────────

const Result = ({ r, isMobile }) => (
  <>
    {/* Two stats or three, depending on whether the round contains chains. The
        column count follows, so two stats fill the row instead of leaving a
        third of the card empty. */}
    <div style={{
      display: "grid", gap: 12, marginTop: 18,
      gridTemplateColumns: r.chains > 0
        ? (isMobile ? "1fr 1fr" : "1fr 1fr 1fr")
        : "1fr 1fr",
    }}>
      <Stat label="Stitches made" value={r.produces} big accent />
      <Stat label="Worked across" value={r.consumes} sub="stitches from the round below" />
      {r.chains > 0 && <Stat label="Chains" value={r.chains} sub="not counted as stitches" />}
    </div>

    {r.groups.filter((g) => g.resolved).length > 0 && (
      <div style={{
        marginTop: 14, padding: "14px 16px", borderRadius: 14,
        background: T.linen, border: `1px solid ${T.line}`,
        fontFamily: T.body, fontSize: 14, lineHeight: 1.8, color: T.ink, fontWeight: 600,
        overflowWrap: "anywhere",
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

    {r.stated !== null && (
      r.matchesStated ? (
        <Note tone="ok">
          The pattern states <b>({r.stated})</b> and the round works out to <b>{r.produces}</b>.
          They agree, so this round is not where your count went wrong.
        </Note>
      ) : (
        <Note tone="warn">
          The pattern states <b>({r.stated})</b> but the instructions work out to{" "}
          <b>{r.produces}</b>. One of the two is wrong. Before assuming it is a typo, check that you
          read the repeat count correctly, and that the previous round really finished with{" "}
          <b>{r.consumes}</b> stitches.
        </Note>
      )
    )}

    {r.ignored.length > 0 && (
      <Note tone="quiet">
        Not counted, because {r.ignored.length === 1 ? "it changes" : "they change"} no stitch count:{" "}
        {r.ignored.map((u, i) => (
          <span key={i}>{i > 0 && ", "}<b>{u}</b></span>
        ))}.
      </Note>
    )}
  </>
);

/** Every path through this component ends with no numbers. That is the point:
 *  the page either understood the round or it did not, and there is no third
 *  state where a total is shown with a caveat attached. */
const Refusal = ({ r }) => {
  if (r.tooManyRounds) {
    return (
      <Note tone="warn">
        <b>That is {r.roundCount} rounds.</b> This page checks one round at a time. Reading a whole
        pattern and reconciling every round in it against the counts it states is a
        different job, and it is the one Wovely does. Paste a single round here, or{" "}
        <A href="/">bring the pattern into Wovely</A>.
      </Note>
    );
  }
  if (r.needsPrevCount) {
    return (
      <Note tone="quiet">
        Waiting on the count from the round below. Fill in the box above and this resolves exactly.
      </Note>
    );
  }
  if (r.mixedDependent) {
    return (
      <Note tone="warn">
        <b>No count for this one.</b> The round has an instruction that runs across every stitch of
        the round below alongside one that does not, and the text never says how the round below is
        divided between them. Splitting it would be a guess, so the page does not. Working the
        round out by hand from the count below it is the honest answer here.
      </Note>
    );
  }
  if (r.unresolvedRepeat) {
    return (
      <Note tone="warn">
        <b>No count for this one.</b> The round repeats an unstated number of times, so the total
        depends on how many stitches the previous round had. Replace the word around with the
        number of repeats and it will resolve.
      </Note>
    );
  }
  if (r.unread.length > 0) {
    return (
      <Note tone="warn">
        <b>No count for this one.</b> {r.unread.length === 1 ? "This part was" : "These parts were"}{" "}
        not read:{" "}
        {r.unread.map((u, i) => (
          <span key={i}>{i > 0 && ", "}<b>{u}</b></span>
        ))}. Counting around{" "}
        {r.unread.length === 1 ? "it" : "them"} would give you a total missing whatever{" "}
        {r.unread.length === 1 ? "it" : "they"} produced, with no way for you to tell by how much,
        so no total is shown. Try writing the round in the plainest form the pattern allows.
      </Note>
    );
  }
  return (
    <Note tone="quiet">
      No stitch instructions found in that. Write the round the way the pattern does, for example{" "}
      <b>(sc 4, inc) x 6</b>.
      {r.chains > 0 && <> The <b>{r.chains}</b> {r.chains === 1 ? "chain" : "chains"} in it are not
      stitches of the round, so on their own there is nothing to count.</>}
    </Note>
  );
};

// ── small presentational pieces ──────────────────────────────────────────────

const P = { fontFamily: T.body, fontSize: 15.5, lineHeight: 1.75, color: T.ink, margin: "0 0 14px" };

const A = ({ href, children }) => (
  <a href={href} style={{ color: T.accentD, fontWeight: 800 }}>{children}</a>
);

const Code = ({ children }) => (
  <code style={{
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: "0.92em",
    background: T.soft, color: T.accentD, padding: "1px 6px", borderRadius: 6, fontWeight: 700,
    overflowWrap: "anywhere",
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

const Faq = ({ q, children }) => (
  <div style={{ marginBottom: 20 }}>
    <h3 style={{ fontFamily: T.disp, fontWeight: 600, fontSize: 17, color: T.ink, margin: "0 0 7px" }}>{q}</h3>
    <p style={{ ...P, margin: 0 }}>{children}</p>
  </div>
);

const Stat = ({ label, value, sub, big, accent }) => (
  <div style={{
    padding: "16px 14px", borderRadius: 16, textAlign: "center", minWidth: 0,
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
    overflowWrap: "anywhere",
  }}>{children}</div>
);
