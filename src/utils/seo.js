// ─── PER-ROUTE SEO HEAD MANAGEMENT ──────────────────────────────────────────
//
// Wovely is a client-rendered SPA behind a catch-all rewrite, so every URL is
// served the SAME index.html. That means every route inherited the homepage's
// <title>, <meta name="description">, and — the actually damaging one — the
// homepage's <link rel="canonical" href="https://wovely.app">.
//
// A canonical pointing at "/" on /privacy and /terms tells Google those two
// pages are duplicates of the homepage and should be dropped from the index.
// Two of the three URLs in sitemap.xml were instructing the crawler to ignore
// them. This module fixes the head per route after hydration.
//
// This module runs in JavaScript, so on its own it only lands on Google's
// render pass. The raw-HTML pass is now covered too: vite.config.js reads the
// table below at build time and writes a real static HTML file per public
// route, each with its own title, description and self-referencing canonical.
// This module and that build step share one source of truth so the two passes
// can never disagree.

const SITE = "https://wovely.app";
const DEFAULT_TITLE = "Wovely: Crochet Pattern Organizer and Row Counter App";
const DEFAULT_DESC = "Save every crochet pattern, track every row, and keep your projects in one place. The home for your hooks, yarn, and works in progress.";

// Public, indexable routes. Anything not listed here is app shell or private
// user content and gets noindex — an empty authed shell rendering under the
// homepage's title is worse than no page at all.
export const PUBLIC_ROUTES = {
  "/": {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    canonical: SITE + "/",
  },
  "/gift": {
    title: "Give Wovely for a Year | A Gift for a Crocheter",
    description: "A year of Wovely Craft as a gift: a hundred patterns in one place, Bev checking every one, every row counted. Sent with a note from Bev within a business day.",
    canonical: SITE + "/gift",
  },
  "/privacy": {
    title: "Privacy Policy | Wovely",
    description: "How Wovely collects, uses, and protects your information, including patterns you upload, payment data handled by Stripe, and your rights over your data.",
    canonical: SITE + "/privacy",
  },
  "/terms": {
    title: "Terms of Service | Wovely",
    description: "The terms that govern your use of Wovely, including subscriptions and billing, ownership of patterns you upload, acceptable use, and dispute resolution.",
    canonical: SITE + "/terms",
  },
  // OPENED 2026-08-07 on Adam's "open the gates" call. These calculators were
  // already reachable signed out (non-root paths fall through the auth check)
  // but were being noindexed along with the app shell, so nobody could find
  // them. The search demand is real and undefended: the results for "crochet
  // yardage calculator" and "crochet gauge swatch calculator" are almost
  // entirely interactive calculators on small independent sites, with no large
  // publisher holding either query. Wovely already shipped the tool. It was
  // just hidden.
  "/tools": {
    title: "Crochet Yardage, Gauge and Scale Calculators | Wovely",
    description: "Free crochet calculators, no signup: yarn yardage, a gauge swatch turned into real stitch counts, and a pattern scaled up or down without redoing the math.",
    canonical: SITE + "/tools",
  },
  // ADDED 2026-08-07. Same thesis as /tools, applied to the queries the audit
  // found undefended: the winning format is an interactive tool, and every page
  // currently ranking serves a static chart. All three render standalone with
  // no auth check, so a signed-out stranger from a search result gets the
  // working tool and nothing else.
  "/uk-us-crochet-terms": {
    title: "UK to US Crochet Terms Converter, Whole Pattern | Wovely",
    description: "Convert a whole crochet pattern between UK and US terms in one pass. dc, tr, htr and dtr are handled together so shared names cannot collide. Free, no signup.",
    canonical: SITE + "/uk-us-crochet-terms",
  },
  "/crochet-abbreviations": {
    title: "Crochet Abbreviations: sc2tog, fpdc, Magic Ring | Wovely",
    description: "Every common crochet abbreviation with its UK equivalent and a plain note on how the stitch is worked. Paste a row you are stuck on and each term gets labeled.",
    canonical: SITE + "/crochet-abbreviations",
  },
  // SPLIT OUT OF /tools 2026-09-07. Three calculators behind tabs on one URL is
  // three searches with three intents fighting over one title. Each now owns a
  // slug that names the tool a person actually typed, and /tools stays as the
  // hub. The page ones for gauge and for pattern scaling are small craft blogs
  // with embedded calculators and no publisher defending either query.
  "/crochet-gauge-calculator": {
    title: "Crochet Gauge Calculator: Swatch to Stitch Count | Wovely",
    description: "Turn a crochet gauge swatch into real numbers: your stitches and rows over a measured swatch, the finished size you want, and the counts to start with. Free.",
    canonical: SITE + "/crochet-gauge-calculator",
  },
  "/yarn-yardage-calculator": {
    title: "Crochet Yarn Yardage Calculator: How Much Yarn? | Wovely",
    description: "Estimate the yards a crochet project needs from its finished size, yarn weight and stitch. Single and double crochet are not the same answer. Free, no signup.",
    canonical: SITE + "/yarn-yardage-calculator",
  },
  "/crochet-pattern-scale-calculator": {
    title: "Crochet Pattern Scale Calculator: Resize to Gauge | Wovely",
    description: "Resize a crochet pattern to a different finished size or to your own gauge, keeping the stitch counts a whole multiple of the repeat so the round still closes.",
    canonical: SITE + "/crochet-pattern-scale-calculator",
  },
  "/crochet-stitch-counter": {
    title: "Crochet Stitch Counter: Does This Round Add Up? | Wovely",
    description: "Paste a written crochet round and see how many stitches it makes and how many it works across. When the two numbers differ, you know which round to recount.",
    canonical: SITE + "/crochet-stitch-counter",
  },
};

// "/hive" is a legacy alias for "/" and must never compete with it in the
// index; it points its canonical at the homepage on purpose.
const CANONICAL_ALIASES = {
  "/hive": SITE + "/",
  "/collections": SITE + "/",
};

const setMetaByName = (name, content) => {
  let el = document.head.querySelector(`meta[name="${name}"]`);
  if (!content) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement("meta"); el.setAttribute("name", name); document.head.appendChild(el); }
  el.setAttribute("content", content);
};

const setMetaByProperty = (property, content) => {
  if (!content) return;
  let el = document.head.querySelector(`meta[property="${property}"]`);
  if (!el) { el = document.createElement("meta"); el.setAttribute("property", property); document.head.appendChild(el); }
  el.setAttribute("content", content);
};

const setCanonical = (href) => {
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) { el = document.createElement("link"); el.setAttribute("rel", "canonical"); document.head.appendChild(el); }
  el.setAttribute("href", href);
};

/**
 * Apply title, description, canonical, Open Graph and robots for a pathname.
 * Safe to call on every route change; it is idempotent.
 */
export function applySeo(pathname, { notFound = false } = {}) {
  if (typeof document === "undefined") return;

  // A path the app does not recognize. The rewrite still answers 200 (see
  // vite.config.js for why the catch-all stays), so the title and a rendered
  // noindex are what keep Google from filing it as a copy of the home page.
  if (notFound) {
    document.title = "Page not found | Wovely";
    setMetaByName("description", null);
    setMetaByName("robots", "noindex, follow");
    setCanonical(SITE + pathname);
    return;
  }

  const route = PUBLIC_ROUTES[pathname];

  if (route) {
    document.title = route.title;
    setMetaByName("description", route.description);
    setMetaByName("robots", null); // indexable — remove any prior noindex
    setCanonical(route.canonical);
    setMetaByProperty("og:title", route.title);
    setMetaByProperty("og:description", route.description);
    setMetaByProperty("og:url", route.canonical);
    setMetaByName("twitter:title", route.title);
    setMetaByName("twitter:description", route.description);
    return;
  }

  // Alias routes: indexable content lives at the canonical target, not here.
  if (CANONICAL_ALIASES[pathname]) {
    document.title = DEFAULT_TITLE;
    setMetaByName("description", DEFAULT_DESC);
    setMetaByName("robots", null);
    setCanonical(CANONICAL_ALIASES[pathname]);
    return;
  }

  // Everything else is the signed-in app shell, a private pattern, or an
  // internal tool. Keep it out of the index and self-canonical so nothing
  // gets folded into the homepage.
  setMetaByName("robots", "noindex, follow");
  setCanonical(SITE + pathname);

  // These two routes own their own <title> (StitchResultPage and MasterDocView
  // both set it). Everywhere else, restore the brand title so a stale one from
  // a previously mounted view cannot leak into the next route.
  const ownsTitle = pathname === "/master-doc" || pathname.startsWith("/stitch/");
  if (!ownsTitle) document.title = DEFAULT_TITLE;
}

// Crawl priority per route, used by the sitemap the build writes. Anything not
// listed gets 0.5. Kept here rather than in a hand-edited public/sitemap.xml,
// because that file went a month with every lastmod reading 2026-08-07 and no
// entry for pages that had shipped since.
export const SITEMAP_PRIORITY = {
  "/": "1.0",
  "/uk-us-crochet-terms": "0.9",
  "/crochet-abbreviations": "0.9",
  "/crochet-gauge-calculator": "0.9",
  "/yarn-yardage-calculator": "0.9",
  "/crochet-pattern-scale-calculator": "0.8",
  "/tools": "0.8",
  "/crochet-stitch-counter": "0.8",
  "/gift": "0.7",
  "/privacy": "0.3",
  "/terms": "0.3",
};

export { DEFAULT_TITLE, DEFAULT_DESC };
