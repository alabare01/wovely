import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { PUBLIC_ROUTES, SITEMAP_PRIORITY } from './src/utils/seo.js'
import { checkFirstRunInvariant } from './scripts/first-run-invariant.mjs'

// ─── FIRST-RUN STARTER GATE ──────────────────────────────────────────────────
//
// Refuses to build an app that opens on nothing for a brand-new user. This has
// shipped before: DEFAULT_STARTERS was emptied on 2026-04-19 and for the seven
// weeks until the S83 starter landed, a stranger's only way in was to go find
// and upload their own PDF. Nothing failed, nothing warned.
//
// The rule lives in scripts/first-run-invariant.mjs, shared with
// test/firstRun.test.mjs so the build gate and the test cannot disagree.
const firstRunGate = () => ({
  name: 'wovely-first-run-gate',
  apply: 'build',
  buildStart() {
    const src = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
    const { ok, reason } = checkFirstRunInvariant(src)
    if (!ok) this.error(`[first-run] ${reason}`)
    // eslint-disable-next-line no-console
    console.log('[first-run] starter present — a new user opens on a pattern')
  },
})

// ─── PER-ROUTE STATIC HEADS ──────────────────────────────────────────────────
//
// Wovely is a client-rendered SPA behind a catch-all rewrite, so every URL was
// served the same index.html — including index.html's <link rel="canonical"
// href="https://wovely.app">. On the raw-HTML pass that told the crawler every
// public page was a duplicate of the homepage, which silently undid the
// per-route canonical that seo.js sets after hydration.
//
// This plugin writes one real HTML file per public route at build time, with
// that route's own title, description, canonical and Open Graph tags. Same
// bundle, same empty #root, correct head before a line of JavaScript runs.
// The route table is imported from seo.js rather than copied, so the raw pass
// and the render pass cannot drift apart.
const seoHeadPrerender = () => ({
  name: 'wovely-seo-head-prerender',
  apply: 'build',
  closeBundle() {
    const outDir = path.resolve('dist')
    const indexPath = path.join(outDir, 'index.html')
    if (!fs.existsSync(indexPath)) return
    const template = fs.readFileSync(indexPath, 'utf8')

    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

    const render = (route) => template
      .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(route.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(route.description)}" />`)
      .replace(/<link rel="canonical"[^>]*>\s*/, '')
      .replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${esc(route.title)}" />`)
      .replace(/<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${esc(route.description)}" />`)
      .replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${esc(route.canonical)}" />`)
      .replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${esc(route.title)}" />`)
      .replace(/<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${esc(route.description)}" />`)
      // hreflang was hard-coded to the homepage in index.html, so every route
      // shipped `<link rel="alternate" href="https://wovely.app/" hreflang="en">`
      // and told a crawler its English equivalent was the homepage. Same class
      // of bug as the hard-coded canonical above, and missed by that fix. Now
      // self-referencing per route, which is what a single-language site should
      // say if it says anything at all.
      .replace(/<link rel="alternate"[^>]*hreflang="en"[^>]*>\s*/, '')
      .replace('</head>', `  <link rel="canonical" href="${esc(route.canonical)}" />\n  <link rel="alternate" href="${esc(route.canonical)}" hreflang="en" />\n  </head>`)

    const written = []
    for (const [pathname, route] of Object.entries(PUBLIC_ROUTES)) {
      const file = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '') + '.html'
      fs.writeFileSync(path.join(outDir, file), render(route), 'utf8')
      written.push(file)
    }
    // The sitemap is generated from the same route table, so a new public page
    // cannot ship without an entry. The hand-edited public/sitemap.xml went a
    // month with every lastmod reading 2026-08-07.
    const today = new Date().toISOString().slice(0, 10)
    const urls = Object.entries(PUBLIC_ROUTES)
      .map(([pathname, route]) => `  <url>\n    <loc>${route.canonical}</loc>\n    <lastmod>${today}</lastmod>\n    <priority>${SITEMAP_PRIORITY[pathname] || '0.5'}</priority>\n  </url>`)
      .join('\n')
    fs.writeFileSync(
      path.join(outDir, 'sitemap.xml'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      'utf8',
    )

    // eslint-disable-next-line no-console
    console.log(`[seo] wrote per-route heads: ${written.join(', ')}`)
    // eslint-disable-next-line no-console
    console.log(`[seo] wrote sitemap.xml with ${Object.keys(PUBLIC_ROUTES).length} URLs`)
  },
})

export default defineConfig({
  plugins: [react(), firstRunGate(), seoHeadPrerender()],
  server: {
    historyApiFallback: true
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'posthog': ['posthog-js', '@posthog/react'],
        }
      }
    },
    chunkSizeWarningLimit: 600,
  }
})
