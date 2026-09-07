// ─── /crochet-abbreviations — REFERENCE + ROW ANNOTATOR ──────────────────────
//
// The results for this query are small blogs serving a bare two-column chart,
// plus (genuinely) a StarCraft disambiguation page, which is Google telling you
// it has run out of good answers. A chart that reads "sc2tog = single crochet 2
// together" answers nobody's actual question, which is "what do I DO with my
// hands." So every row here carries a plain-English instruction, and the tool
// at the top takes a row of a real pattern and labels it term by term.

import { useState, useMemo } from "react";
import { T, useBreakpoint } from "./theme.jsx";
import PublicPage, { CARD, LABEL, useJsonLd } from "./components/PublicPage.jsx";
import { ABBREVIATIONS, annotateRow } from "./utils/crochetTerms.js";

const GROUPS = ["Stitches", "Shaping", "Post & placement", "Amigurumi", "Pattern shorthand"];
const EXAMPLE_ROW = "Rnd 4: ch 1, 2 dc in next st, sk 1 st, fpdc, sc2tog, sl st in blo to join. (24 sts)";

// Exported so the build can write this same block into the page's raw HTML
// head (scripts/prerender.mjs). A crawler that does not run JavaScript was
// getting no structured data at all, because useJsonLd runs in an effect.
export const PAGE_SCHEMA = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name: "Crochet Abbreviations Reference",
  url: "https://wovely.app/crochet-abbreviations",
  applicationCategory: "ReferenceApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description:
    "Every common crochet abbreviation with its UK equivalent and a plain-English description of how the stitch is worked, plus a tool that labels each term in a row you paste.",
};

export default function CrochetAbbreviations() {
  const { isMobile } = useBreakpoint();
  const [query, setQuery] = useState("");
  const [row, setRow] = useState(EXAMPLE_ROW);
  const [picked, setPicked] = useState(null);

  const annotated = useMemo(() => annotateRow(row), [row]);
  const found = annotated.filter((p) => p.info);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ABBREVIATIONS;
    return ABBREVIATIONS.filter(
      (a) =>
        a.abbr.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.uk.toLowerCase().includes(q) ||
        a.what.toLowerCase().includes(q)
    );
  }, [query]);

  useJsonLd(PAGE_SCHEMA);

  return (
    <PublicPage
      path="/crochet-abbreviations"
      h1="Crochet abbreviations, explained"
      intro={
        <>
          Every common abbreviation with its UK equivalent and a plain description of what your
          hands actually do. Paste a row you are stuck on and the tool below will label each term
          in it.
        </>
      }
      closer={{
        title: "Looking one up is quick. Looking up forty is an evening.",
        body:
          "A pattern written in shorthand you half know is a pattern you read twice. Wovely keeps your patterns in one place, marks off rows as you go, and opens on your phone at the row you actually stopped on rather than the one you think you stopped on.",
        cta: "Try Wovely free",
        note: "No account needed to start",
      }}
    >
      {/* ── ROW ANNOTATOR ── */}
      <div style={{ ...CARD, padding: isMobile ? 18 : 26 }}>
        <div style={{ ...LABEL, marginBottom: 8 }}>Paste a row you are stuck on</div>
        <textarea
          value={row}
          onChange={(e) => { setRow(e.target.value); setPicked(null); }}
          spellCheck={false}
          rows={2}
          placeholder="Rnd 4: ch 1, 2 dc in next st, sk 1 st, sc2tog."
          style={{
            width: "100%", padding: 15, borderRadius: 16,
            border: `1.5px solid ${T.line}`, background: "#fff", color: T.ink,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 14, lineHeight: 1.7, resize: "vertical", outline: "none",
          }}
          onFocus={(e) => (e.target.style.borderColor = T.accent)}
          onBlur={(e) => (e.target.style.borderColor = T.line)}
        />

        {/* the annotated row */}
        <div style={{
          marginTop: 14, padding: 16, borderRadius: 16, background: T.linen,
          border: `1px solid ${T.line}`,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          fontSize: 14.5, lineHeight: 2.1, color: T.ink,
        }}>
          {row.trim() ? (
            annotated.map((p, i) =>
              p.info ? (
                <button
                  key={i}
                  onClick={() => setPicked(picked?.i === i ? null : { i, info: p.info })}
                  style={{
                    background: picked?.i === i ? T.accent : "#EDE7FB",
                    color: picked?.i === i ? "#fff" : T.accentD,
                    // Tight horizontal padding: at 6px the chip visibly detached
                    // the term from the comma that follows it, so a row read as
                    // "st , sk 1 st ," instead of as a sentence.
                    border: "none", borderRadius: 5, padding: "2px 3px",
                    fontFamily: "inherit", fontSize: "inherit", fontWeight: 700,
                    cursor: "pointer", transition: "background .12s",
                  }}
                >{p.text}</button>
              ) : (
                <span key={i}>{p.text}</span>
              )
            )
          ) : (
            <span style={{ color: T.ink3, fontFamily: T.body }}>Paste a row above to see it labelled.</span>
          )}
        </div>

        {/* what was found */}
        {row.trim() && found.length === 0 && (
          <div style={{ marginTop: 12, fontFamily: T.body, fontSize: 13.5, color: T.muted, fontWeight: 600 }}>
            No abbreviations recognised in that row. If the row is written out in full words rather
            than abbreviations, there is nothing here to label.
          </div>
        )}

        {picked && (
          <div style={{
            marginTop: 14, padding: 16, borderRadius: 16,
            background: T.soft, border: "1px solid #E2DAF6",
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
              <span style={{ fontFamily: T.disp, fontWeight: 700, fontSize: 18, color: T.ink }}>{picked.info.abbr}</span>
              <span style={{ fontFamily: T.body, fontWeight: 700, fontSize: 14, color: T.accentD }}>{picked.info.name}</span>
              {picked.info.uk && picked.info.uk !== picked.info.abbr && (
                <span style={{ fontFamily: T.body, fontSize: 12.5, color: T.muted, fontWeight: 600 }}>
                  UK: {picked.info.uk}
                </span>
              )}
            </div>
            <div style={{ fontFamily: T.body, fontSize: 15, lineHeight: 1.7, color: T.ink }}>{picked.info.what}</div>
          </div>
        )}

        {row.trim() && found.length > 0 && !picked && (
          <div style={{ marginTop: 12, fontFamily: T.body, fontSize: 13.5, color: T.muted, fontWeight: 600 }}>
            {found.length} {found.length === 1 ? "term" : "terms"} recognised. Tap any highlighted
            term to see what it means.
          </div>
        )}
      </div>

      {/* ── THE REFERENCE ── */}
      <div style={{ ...CARD, padding: isMobile ? 20 : 30, marginTop: 20 }}>
        <h2 style={{
          fontFamily: T.disp, fontWeight: 700, fontSize: isMobile ? 21 : 25,
          color: T.ink, margin: "0 0 14px", lineHeight: 1.25,
        }}>Crochet abbreviation list</h2>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search: sc2tog, magic ring, back post…"
          style={{
            width: "100%", padding: "13px 16px", borderRadius: 14,
            border: `1.5px solid ${T.line}`, background: "#fff", color: T.ink,
            fontFamily: T.body, fontSize: 15, fontWeight: 600, outline: "none", marginBottom: 20,
          }}
          onFocus={(e) => (e.target.style.borderColor = T.accent)}
          onBlur={(e) => (e.target.style.borderColor = T.line)}
        />

        {filtered.length === 0 && (
          <div style={{ fontFamily: T.body, fontSize: 15, color: T.muted, fontWeight: 600, padding: "10px 0" }}>
            Nothing here matches “{query}”. It may be a designer's own shorthand, in which case the
            pattern should define it near the top.
          </div>
        )}

        {GROUPS.map((g) => {
          const rows = filtered.filter((a) => a.group === g);
          if (!rows.length) return null;
          return (
            <div key={g} style={{ marginBottom: 26 }}>
              <div style={{ ...LABEL, marginBottom: 10 }}>{g}</div>
              <div style={{ display: "grid", gap: 10 }}>
                {rows.map((a) => (
                  <div key={a.abbr} style={{
                    display: "grid",
                    gridTemplateColumns: isMobile ? "1fr" : "132px 1fr",
                    gap: isMobile ? 4 : 16,
                    padding: "13px 0", borderTop: `1px solid ${T.line}`,
                  }}>
                    <div>
                      <div style={{
                        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                        fontWeight: 700, fontSize: 15, color: T.accentD,
                      }}>{a.abbr}</div>
                      {a.uk !== a.abbr && (
                        <div style={{ fontFamily: T.body, fontSize: 11.5, color: T.ink3, fontWeight: 700, marginTop: 2 }}>
                          UK: {a.uk}
                        </div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontFamily: T.body, fontWeight: 800, fontSize: 14.5, color: T.ink, marginBottom: 3 }}>{a.name}</div>
                      <div style={{ fontFamily: T.body, fontSize: 14.5, lineHeight: 1.68, color: T.muted, fontWeight: 500 }}>{a.what}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── FAQ ── */}
      <div style={{ ...CARD, padding: isMobile ? 20 : 30, marginTop: 20 }}>
        <h2 style={{
          fontFamily: T.disp, fontWeight: 700, fontSize: isMobile ? 21 : 25,
          color: T.ink, margin: "0 0 16px", lineHeight: 1.25,
        }}>Common questions</h2>

        <Faq q="What does sc2tog mean?">
          Single crochet two together, a decrease. Pull up a loop in the next stitch, then pull up a
          loop in the one after, so you have three loops on the hook. Yarn over and pull through all
          three. Two stitches have become one and your count drops by one.
        </Faq>
        <Faq q="What is the difference between dc2tog and a cluster?">
          The mechanics are the same: several partly worked stitches closed together at the top.
          The difference is where they go. A dc2tog is worked across two <i>different</i> stitches
          and decreases your count. A cluster is usually worked into one stitch or one chain space,
          so the count does not drop and you get a solid textured bump instead.
        </Faq>
        <Faq q="What does a magic ring do that chaining does not?">
          Chaining four and joining leaves a fixed hole in the middle that you cannot close later.
          A magic ring is a loop you work into and then pull tight by the tail, so the centre shuts
          completely. For amigurumi that matters, because stuffing shows through the hole.
        </Faq>
        <Faq q="Why do fpdc and bpdc make ribbing?">
          Both are worked around the post of the stitch below rather than into its top. A front post
          stitch pulls that column toward you and a back post stitch pushes it away. Alternating them
          along a row makes the columns sit at different depths, and that ridged surface is ribbing.
        </Faq>
        <Faq q="My pattern uses an abbreviation that is not on this list.">
          Designers invent shorthand for stitches they use a lot, especially in amigurumi. A pattern
          that does this should define it in a key near the top, before the first round. If it does
          not, that is worth asking the designer about rather than guessing, because a made-up
          abbreviation cannot be looked up anywhere.
        </Faq>
        <Faq q="Are these UK or US abbreviations?">
          The left-hand column is US, which is what most published patterns use, and the UK
          equivalent sits underneath wherever the two differ. If you have a whole pattern to convert
          rather than one term to look up, the{" "}
          <a href="/uk-us-crochet-terms" style={{ color: T.accent, fontWeight: 700 }}>
            UK to US converter
          </a>{" "}
          will do the entire thing at once.
        </Faq>
      </div>
    </PublicPage>
  );
}

const Faq = ({ q, children }) => (
  <div style={{ marginBottom: 20 }}>
    <h3 style={{ fontFamily: T.disp, fontWeight: 600, fontSize: 17, color: T.ink, margin: "0 0 7px" }}>{q}</h3>
    <p style={{ fontFamily: T.body, fontSize: 15.5, lineHeight: 1.75, color: T.ink, margin: 0 }}>{children}</p>
  </div>
);
