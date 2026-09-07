// Runs after `vite build`. Loads the prerender bundle, renders each public
// tool page with the real components, and writes the markup into that route's
// own HTML file inside #root. See src/entry-prerender.jsx for why.
//
// It also lifts the FAQPage structured data straight out of the markup it just
// rendered, rather than from a hand-kept copy of the questions. Google's rule
// for FAQ markup is that it must match what a reader sees on the page, so
// deriving it from the render is the only version that cannot quietly drift.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const OUT = path.resolve("dist");
const BUNDLE = path.resolve("dist-prerender/entry-prerender.js");

if (!fs.existsSync(BUNDLE)) {
  console.error(`[prerender] no bundle at ${BUNDLE}`);
  process.exit(1);
}

const mod = await import(pathToFileURL(BUNDLE).href);

const stripTags = (html) =>
  html
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

/** Pull the visible Q and A pairs out of the rendered FAQ block. */
const faqFromMarkup = (html) => {
  const start = html.indexOf("Common questions");
  if (start === -1) return [];
  const region = html.slice(start);
  const pairs = [];
  const re = /<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(region))) {
    const q = stripTags(m[1]);
    const a = stripTags(m[2]);
    if (q && a && q.length < 200 && a.length > 40) pairs.push({ q, a });
  }
  return pairs;
};

const jsonLdTag = (obj) =>
  `  <script type="application/ld+json" data-wovely-jsonld="build">${JSON.stringify(obj)
    .replace(/</g, "\\u003c")}</script>\n`;

let failures = 0;
for (const pathname of Object.keys(mod.PRERENDER_ROUTES)) {
  const file = path.join(OUT, pathname.replace(/^\//, "") + ".html");
  if (!fs.existsSync(file)) {
    console.error(`[prerender] no head file for ${pathname} - run the seo plugin first`);
    failures++;
    continue;
  }

  let body;
  try {
    body = mod.renderRoute(pathname);
  } catch (err) {
    console.error(`[prerender] ${pathname} threw: ${err.message}`);
    failures++;
    continue;
  }
  if (!body || body.length < 1500) {
    console.error(`[prerender] ${pathname} rendered ${body ? body.length : 0} chars - refusing`);
    failures++;
    continue;
  }

  const before = fs.readFileSync(file, "utf8");
  if (!before.includes('<div id="root"></div>')) {
    console.error(`[prerender] ${pathname}: no empty #root to fill`);
    failures++;
    continue;
  }

  let head = "";
  const schema = mod.PAGE_SCHEMAS[pathname];
  if (schema) head += jsonLdTag(schema);

  const faq = faqFromMarkup(body);
  if (faq.length) {
    head += jsonLdTag({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faq.map(({ q, a }) => ({
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: a },
      })),
    });
  }

  const after = before
    .replace("</head>", head + "  </head>")
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);

  fs.writeFileSync(file, after, "utf8");
  const text = stripTags(body.replace(/<script[\s\S]*?<\/script>/g, " "));
  console.log(
    `[prerender] ${pathname} -> ${text.length.toLocaleString()} chars of readable text, ${faq.length} FAQ entries`
  );
}

// Fail the build rather than ship an empty body silently. An SPA that quietly
// stops prerendering looks identical to one that never did.
if (failures) {
  console.error(`[prerender] ${failures} route(s) failed`);
  process.exit(1);
}
