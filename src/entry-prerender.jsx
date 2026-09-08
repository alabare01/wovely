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

import Auth from "./Auth.jsx";
import PrivacyPolicy from "./PrivacyPolicy.jsx";
import TermsOfService from "./TermsOfService.jsx";
import UkUsConverter, { PAGE_SCHEMA as UK_US_SCHEMA } from "./UkUsConverter.jsx";
import CrochetAbbreviations, { PAGE_SCHEMA as ABBR_SCHEMA } from "./CrochetAbbreviations.jsx";
import StitchCounter, { PAGE_SCHEMA as COUNTER_SCHEMA } from "./StitchCounter.jsx";
import PublicCalculators, { PAGE_SCHEMA as TOOLS_SCHEMA } from "./PublicCalculators.jsx";
import {
  GaugeCalculatorPage, YardageCalculatorPage, ScaleCalculatorPage,
  GAUGE_SCHEMA, YARDAGE_SCHEMA, SCALE_SCHEMA,
} from "./CalculatorPages.jsx";

// ─── THE HOMEPAGE ────────────────────────────────────────────────────────────
//
// Added 2026-09-08. The seven tool pages below were prerendered on 2026-09-07
// and the homepage was not, so the most-linked URL on the property, priority
// 1.0 in the sitemap, was still serving a crawler an empty div while every
// smaller page underneath it read fine.
//
// App.jsx renders <Auth/> at "/" for a signed-out visitor, and that component
// IS the landing page: hero, what the app does, the three prices, footer. So
// the same rule the tool pages follow applies here. Render the component the
// browser renders, never a hand-written summary of it, because a summary is a
// second copy of the marketing that can drift from the first one silently.
//
// Every prop Auth takes is a click handler and renderToStaticMarkup drops
// handlers, so the no-ops below change nothing in the markup.
const noop = () => {};
const Home = () => <Auth onEnter={noop} onEnterAsNew={noop} onTryAnonymous={noop} />;

export const PRERENDER_ROUTES = {
  "/": Home,
  "/privacy": PrivacyPolicy,
  "/terms": TermsOfService,
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
