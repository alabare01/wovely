// ─── ONE CALCULATOR, ONE URL ─────────────────────────────────────────────────
//
// /tools carried three different products behind tabs: a gauge calculator, a
// yardage calculator and a pattern scaler. Those are three separate searches
// with three separate intents, and a single URL whose title tried to serve all
// three could not win any of them. The 2026-09-06 audit found the page ones for
// "crochet gauge calculator" and "crochet pattern scale calculator" held
// entirely by small craft blogs with embedded calculators and no publisher
// defending either query. Wovely already had the better tool. It had no URL.
//
// Each page below owns its own slug, title, description, canonical, h1 and
// copy, and opens on its own tab. The other two calculators stay one click
// away, because somebody sizing a blanket usually checks gauge in the same
// sitting. /tools survives as the hub that links all three.

import PublicPage, { CARD, useJsonLd } from "./components/PublicPage.jsx";
import Calculators from "./Calculators.jsx";
import { T, useBreakpoint } from "./theme.jsx";

const SITE = "https://wovely.app";

const schemaFor = (slug, name, description) => ({
  "@context": "https://schema.org",
  "@type": "WebApplication",
  name,
  url: SITE + slug,
  applicationCategory: "UtilitiesApplication",
  operatingSystem: "Any",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  description,
});

const Faq = ({ q, children }) => (
  <div style={{ marginBottom: 20 }}>
    <h3 style={{ fontFamily: T.disp, fontWeight: 600, fontSize: 17, color: T.ink, margin: "0 0 7px" }}>{q}</h3>
    <p style={{ fontFamily: T.body, fontSize: 15.5, lineHeight: 1.75, color: T.ink, margin: 0 }}>{children}</p>
  </div>
);

const Questions = ({ isMobile, children }) => (
  <div style={{ ...CARD, padding: isMobile ? 20 : 30, marginTop: 20 }}>
    <h2 style={{
      fontFamily: T.disp, fontWeight: 700, fontSize: isMobile ? 21 : 25,
      color: T.ink, margin: "0 0 16px", lineHeight: 1.25,
    }}>Common questions</h2>
    {children}
  </div>
);

/** Shared shell: public chrome, the calculator opened on the right tab, then
 *  this page's own questions. */
const CalcPage = ({ path, tab, h1, intro, closer, children }) => {
  const { isMobile } = useBreakpoint();
  return (
    <PublicPage path={path} h1={h1} intro={intro} closer={closer}>
      <div style={{ ...CARD, padding: isMobile ? 16 : 26, minWidth: 0, overflow: "hidden" }}>
        <Calculators embedded initialTab={tab} />
      </div>
      <Questions isMobile={isMobile}>{children}</Questions>
    </PublicPage>
  );
};

// ─── GAUGE ───────────────────────────────────────────────────────────────────

export const GAUGE_SCHEMA = schemaFor(
  "/crochet-gauge-calculator",
  "Crochet Gauge Calculator",
  "Turn a crochet gauge swatch into the number of stitches and rows a finished piece needs at your own tension."
);

export function GaugeCalculatorPage() {
  useJsonLd(GAUGE_SCHEMA);
  return (
    <CalcPage
      path="/crochet-gauge-calculator"
      tab="gauge"
      h1="Crochet gauge calculator"
      intro={
        <>
          Work a swatch, measure it, and this works out how many stitches to start with and how many
          rows to work for the size you actually want. Free, no signup, and the arithmetic happens in
          your browser.
        </>
      }
      closer={{
        title: "A swatch tells you the size. It does not keep your place",
        body:
          "Wovely holds your patterns in one place and marks off rows as you go, so you open your phone to the row you actually stopped on rather than the one you think you stopped on. This calculator stays free whether you sign up or not.",
      }}
    >
      <Faq q="How do I work a crochet gauge swatch?">
        Work a square a good deal bigger than the area you plan to measure, in the stitch the pattern
        uses, then lay it flat without stretching it. Measure a four inch window somewhere in the
        middle rather than at the edges, and count the stitches and rows inside it. The edges of a
        swatch always lie about the tension.
      </Faq>
      <Faq q="My gauge does not match the pattern. What do I change?">
        Hook size first, because it moves tension the most for the least effort. A larger hook gives
        you fewer stitches to the inch, a smaller hook gives you more. Change one size, work a fresh
        swatch and measure again. If the stitch count comes right and the row count is still off,
        that is normal in crochet and usually handled by working to a measurement rather than to a
        row number.
      </Faq>
      <Faq q="Does gauge really matter for a blanket?">
        Less than it does for a garment, but it still decides how much yarn you buy and how big the
        finished thing ends up. A blanket worked at a looser tension than the pattern assumed comes
        out wider, longer and hungrier for yarn, and you find out at the end.
      </Faq>
      <Faq q="Why does this ask for a swatch size?">
        Because a gauge is only a number if you say what area it was measured over. Four inches is
        the usual window and ten centimetres is the usual metric one. Measuring over a smaller area
        makes every counting error bigger.
      </Faq>
    </CalcPage>
  );
}

// ─── YARDAGE ─────────────────────────────────────────────────────────────────

export const YARDAGE_SCHEMA = schemaFor(
  "/yarn-yardage-calculator",
  "Yarn Yardage Calculator for Crochet",
  "Estimate how many yards of yarn a crochet project needs from its finished size, the yarn weight and the stitch."
);

export function YardageCalculatorPage() {
  useJsonLd(YARDAGE_SCHEMA);
  return (
    <CalcPage
      path="/yarn-yardage-calculator"
      tab="yardage"
      h1="Yarn yardage calculator"
      intro={
        <>
          Give it the finished size, the yarn weight and the stitch you are working, and it estimates
          how many yards the project will eat. Useful before you buy, and more useful before you buy
          a dye lot you cannot match later.
        </>
      }
      closer={{
        title: "Buying the yarn is the easy half",
        body:
          "Wovely keeps the pattern, your place in it and what you have in your stash together, so the project you started in March is still findable in September. This calculator stays free whether you sign up or not.",
      }}
    >
      <Faq q="How much yarn do I need for a blanket?">
        It depends on three things and nothing else: the finished area, the yarn weight and the
        stitch. A worsted weight throw around 50 by 60 inches in single crochet runs well over a
        thousand yards, and the same blanket in double crochet uses noticeably less, because taller
        stitches cover more area per yard. Put your own numbers in above rather than trusting a
        rounded figure from a blog.
      </Faq>
      <Faq q="Why does the stitch change the answer so much?">
        A single crochet is short and dense, so it takes many more stitches to cover the same square
        inch. Double and treble crochet are taller and more open. Same yarn, same blanket, and the
        yardage can differ by a third or more purely on stitch choice.
      </Faq>
      <Faq q="Should I buy extra?">
        Buy more than the estimate, and buy it in the same dye lot. An estimate assumes an even
        tension and no frogging, and neither survives a real project. Yarn left over is a hat. Yarn
        that runs out three rows from the end in a discontinued colour is a different project
        entirely.
      </Faq>
      <Faq q="Does this work in metres?">
        The estimate is in yards. Metres are yards multiplied by 0.9144, so a thousand yards is about
        914 metres. Yarn bands usually print both.
      </Faq>
    </CalcPage>
  );
}

// ─── SCALE ───────────────────────────────────────────────────────────────────

export const SCALE_SCHEMA = schemaFor(
  "/crochet-pattern-scale-calculator",
  "Crochet Pattern Scale Calculator",
  "Resize a crochet pattern to a different finished size, or to your own gauge, without redoing the stitch maths by hand."
);

export function ScaleCalculatorPage() {
  useJsonLd(SCALE_SCHEMA);
  return (
    <CalcPage
      path="/crochet-pattern-scale-calculator"
      tab="resize"
      h1="Crochet pattern scale calculator"
      intro={
        <>
          Take a pattern written at one gauge and work out what it becomes at yours, or at a
          different finished size. Enter the pattern's gauge, enter your own, and the stitch counts
          come out adjusted, including a repeat you paste in.
        </>
      }
      closer={{
        title: "Resizing is arithmetic. Keeping your place is not",
        body:
          "Wovely holds the pattern and marks off rows as you go, so a resized project does not turn into a page of crossings-out. This calculator stays free whether you sign up or not.",
      }}
    >
      <Faq q="Can I just multiply every stitch count?">
        For a plain fabric, largely yes. For anything with a repeat, no: the new count has to stay a
        multiple of the repeat or the pattern stops lining up at the end of the round. That is why
        this page takes the repeat as well as the count and rounds to a number that still works.
      </Faq>
      <Faq q="How do I make an amigurumi bigger?">
        Two ways, and they are not equivalent. A heavier yarn with a bigger hook keeps every stitch
        count identical and scales the whole thing, which is the safe route. Adding increase rounds
        changes the shape as well as the size, and for a piece that has to be stuffed and sewn, shape
        changes compound.
      </Faq>
      <Faq q="What if my row gauge is off but my stitch gauge is right?">
        Common in crochet and usually not worth fighting. Work to the measurement the pattern gives
        rather than to its row count, and check the length as you go. Where a pattern shapes on
        specific rows, recalculate those positions from your own row gauge.
      </Faq>
      <Faq q="I am using a different yarn on an amigurumi. What size safety eyes or nose do I need?">
        The parts scale with the piece, in a straight line. Work out how much smaller or bigger
        your version comes out (your stitches per 10 cm against the pattern's, or your finished
        height against the designer's) and multiply the eye or nose size by the same figure. A
        22 mm nose on a super bulky piece becomes roughly 12 to 14 mm in worsted, so buy the
        nearest stocked size, 12 or 15 mm, and hold it against the head before you stuff. Safety
        eyes only go in once, so test on the unstuffed piece.
      </Faq>
      <Faq q="Does scaling change how much yarn I need?">
        Yes, and not in a straight line. Yarn use follows area, so a piece made 20 percent wider and
        20 percent longer needs roughly 44 percent more yarn, not 20. Run the new finished size
        through the yardage calculator before buying.
      </Faq>
    </CalcPage>
  );
}
