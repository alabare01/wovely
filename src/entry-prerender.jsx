// ─── BUILD-TIME PRERENDER ENTRY ──────────────────────────────────────────────
//
// Wovely is a client-rendered SPA, so until 2026-09-07 every public URL was
// served <div id="root"></div> and nothing else. The heads were per-route and
// careful; the bodies were empty. Google renders JavaScript on a delayed second
// pass allocated by crawl budget, and a new domain with few backlinks sits at
// the bottom of that queue. Bing, DuckDuckGo, most assistant retrieval crawlers
// and every social unfurler do not render at all. The site's best content -
// four working, genuinely useful tool pages - was invisible to all of them.
//
// This entry renders those pages to static HTML at build time. It imports the
// SAME components the browser runs, so the raw-HTML pass and the render pass
// cannot drift apart. It is deliberately NOT hydration: main.jsx still calls
// createRoot().render(), which replaces the container's children. The static
// markup is what a crawler reads and what a human sees before the bundle
// parses; React then takes over and the page becomes interactive.
import { StaticRouter } from "react-router";
import { renderToStaticMarkup } from "react-dom/server";

import UkUsConverter, { PAGE_SCHEMA as UK_US_SCHEMA } from "./UkUsConverter.jsx";
import CrochetAbbreviations, { PAGE_SCHEMA as ABBR_SCHEMA } from "./CrochetAbbreviations.jsx";
import StitchCounter, { PAGE_SCHEMA as COUNTER_SCHEMA } from "./StitchCounter.jsx";
import PublicCalculators, { PAGE_SCHEMA as TOOLS_SCHEMA } from "./PublicCalculators.jsx";
import {
  GaugeCalculatorPage, YardageCalculatorPage, ScaleCalculatorPage,
  GAUGE_SCHEMA, YARDAGE_SCHEMA, SCALE_SCHEMA,
} from "./CalculatorPages.jsx";

export const PRERENDER_ROUTES = {
  "/uk-us-crochet-terms": UkUsConverter,
  "/crochet-abbreviations": CrochetAbbreviations,
  "/crochet-stitch-counter": StitchCounter,
  "/tools": PublicCalculators,
  "/crochet-gauge-calculator": GaugeCalculatorPage,
  "/yarn-yardage-calculator": YardageCalculatorPage,
  "/crochet-pattern-scale-calculator": ScaleCalculatorPage,
};

/** The per-page WebApplication block, so the raw-HTML pass carries it too. */
export const PAGE_SCHEMAS = {
  "/uk-us-crochet-terms": UK_US_SCHEMA,
  "/crochet-abbreviations": ABBR_SCHEMA,
  "/crochet-stitch-counter": COUNTER_SCHEMA,
  "/tools": TOOLS_SCHEMA,
  "/crochet-gauge-calculator": GAUGE_SCHEMA,
  "/yarn-yardage-calculator": YARDAGE_SCHEMA,
  "/crochet-pattern-scale-calculator": SCALE_SCHEMA,
};

export function renderRoute(pathname) {
  const Component = PRERENDER_ROUTES[pathname];
  if (!Component) return null;
  return renderToStaticMarkup(
    <StaticRouter location={pathname}>
      <Component />
    </StaticRouter>
  );
}
