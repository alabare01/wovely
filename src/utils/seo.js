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
// Honest limit: this runs in JavaScript, so it lands on Google's render pass,
// not the raw-HTML pass. It is the correct fix available without SSR or
// prerendering. Static per-route HTML would be strictly better and is the
// follow-up, not a substitute for this.

const SITE = "https://wovely.app";
const DEFAULT_TITLE = "Wovely: Crochet Pattern Organizer, Row Counter and Stitch Tracker";
const DEFAULT_DESC = "Save every crochet pattern, track every row, and keep your projects in one place. The home for your hooks, yarn, and works in progress.";

// Public, indexable routes. Anything not listed here is app shell or private
// user content and gets noindex — an empty authed shell rendering under the
// homepage's title is worse than no page at all.
const PUBLIC_ROUTES = {
  "/": {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESC,
    canonical: SITE + "/",
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
    description: "Free crochet calculators, no signup. Work out how much yarn a project needs, turn a gauge swatch into real stitch counts, and scale a pattern up or down without redoing the math.",
    canonical: SITE + "/tools",
  },
  // ADDED 2026-08-07. Same thesis as /tools, applied to the queries the audit
  // found undefended: the winning format is an interactive tool, and every page
  // currently ranking serves a static chart. All three render standalone with
  // no auth check, so a signed-out stranger from a search result gets the
  // working tool and nothing else.
  "/uk-us-crochet-terms": {
    title: "UK to US Crochet Term Converter: Paste a Whole Pattern | Wovely",
    description: "Convert a whole crochet pattern between UK and US terms in one pass. Handles dc, tr, htr and dtr together, so the shared abbreviations cannot collide the way they do when you edit by hand. Free, no signup, nothing uploaded.",
    canonical: SITE + "/uk-us-crochet-terms",
  },
  "/crochet-abbreviations": {
    title: "Crochet Abbreviations Explained: sc2tog, dc2tog, Magic Ring, fpdc | Wovely",
    description: "Every common crochet abbreviation with its UK equivalent and a plain-English description of how the stitch is actually worked. Paste a row you are stuck on and each term in it gets labelled.",
    canonical: SITE + "/crochet-abbreviations",
  },
  "/crochet-stitch-counter": {
    title: "Crochet Stitch Count Checker: Does This Round Add Up? | Wovely",
    description: "Paste a written crochet round and see how many stitches it makes and how many it works across. When a count stops adding up, the gap between those two numbers tells you which round to recount.",
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
export function applySeo(pathname) {
  if (typeof document === "undefined") return;

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

export { DEFAULT_TITLE, DEFAULT_DESC };
