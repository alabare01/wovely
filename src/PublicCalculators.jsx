// ─── /tools, SIGNED OUT ──────────────────────────────────────────────────────
//
// /tools is live and already requested for indexing, so this is where search
// traffic lands first. It was landing inside the signed-in app shell, which got
// a stranger three things it should not have: a layout that clipped on a phone,
// a "Sign out" button for a session they had never started, and no way at all
// to sign up.
//
// Signed out it now renders on the same public chrome as the other three tool
// pages: one h1, the calculators, one honest call to action, and cross-links to
// the rest. Signed in, /tools is untouched and stays the Workbench inside the
// shell. Calculators itself is the same component in both, rendered with
// `embedded` so the surrounding page owns the heading and the padding.

import PublicPage, { CARD, useJsonLd } from "./components/PublicPage.jsx";
import Calculators from "./Calculators.jsx";
import { T, useBreakpoint } from "./theme.jsx";

export default function PublicCalculators() {
  const { isMobile } = useBreakpoint();

  useJsonLd({
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: "Crochet Gauge, Yardage and Scale Calculators",
    url: "https://wovely.app/tools",
    applicationCategory: "UtilitiesApplication",
    operatingSystem: "Any",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    description:
      "Work out how much yarn a crochet project needs, turn a gauge swatch into real stitch counts, and scale a pattern to your own gauge.",
  });

  return (
    <PublicPage
      path="/tools"
      h1="Crochet gauge, yardage and scale calculators"
      intro={
        <>
          Three calculators for the arithmetic before the hooking starts: how much yarn to buy,
          what your swatch means in stitches, and what to change when your gauge does not match the
          pattern's. Free, no signup, nothing to install.
        </>
      }
      closer={{
        title: "The math is the easy part. Keeping your place is not.",
        body:
          "Wovely holds your patterns in one place and marks off rows as you go, so you open your phone to the row you actually stopped on rather than the one you think you stopped on. Every calculator on this page stays free and open whether you sign up or not.",
        cta: "Try Wovely free",
        note: "No account needed to start",
      }}
    >
      <div style={{ ...CARD, padding: isMobile ? 16 : 26, minWidth: 0, overflow: "hidden" }}>
        <Calculators embedded />
      </div>

      <div style={{ ...CARD, padding: isMobile ? 20 : 30, marginTop: 20 }}>
        <h2 style={{
          fontFamily: T.disp, fontWeight: 700, fontSize: isMobile ? 21 : 25,
          color: T.ink, margin: "0 0 14px", lineHeight: 1.25,
        }}>How to use each one</h2>
        <p style={P}>
          <b>Gauge.</b> Crochet a square, measure four inches across the middle of it rather than at
          the edges, and count the stitches and rows inside that measurement. Put those numbers in
          with your target size and you get the number of stitches to start with and the number of
          rows to work. Measuring the edges is the usual reason a blanket comes out the wrong width.
        </p>
        <p style={P}>
          <b>Yardage.</b> An estimate of how much yarn a finished piece of a given size will take at
          a given density. Treat it as a shopping figure with a skein of headroom rather than an
          exact answer: yarn weight, stitch pattern and how tightly you work all move it.
        </p>
        <p style={{ ...P, marginBottom: 0 }}>
          <b>Scale.</b> Enter the pattern's gauge and your own, and it gives you the multiplier
          between them along with what that does to the finished size. It also scales a repeat, so
          you can see what a shaping round becomes at your gauge instead of working it out on paper.
        </p>
      </div>
    </PublicPage>
  );
}

const P = { fontFamily: T.body, fontSize: 15.5, lineHeight: 1.75, color: T.ink, margin: "0 0 14px" };
