import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
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

// ─── ROUTE-REACHABILITY GATE ─────────────────────────────────────────────────
//
// Every public route is served from its own prerendered HTML file, and the only
// thing that connects the URL to that file is an explicit rewrite in
// vercel.json. On 2026-09-07 three new calculator pages built correctly, wrote
// correct heads, prerendered 2,238 to 2,550 characters of body each, deployed
// green, and then answered as the homepage in production, because nobody added
// their three lines to vercel.json. A page that builds is not a page that is
// reachable. This refuses the build instead.
const routeReachabilityGate = () => ({
  name: 'wovely-route-reachability-gate',
  apply: 'build',
  buildStart() {
    const vercel = JSON.parse(fs.readFileSync(path.resolve('vercel.json'), 'utf8'))
    const sources = new Set((vercel.rewrites || []).map((r) => r.source))
    const missing = Object.keys(PUBLIC_ROUTES).filter((p) => p !== '/' && !sources.has(p))
    if (missing.length) {
      this.error(
        `[routes] these public routes have no rewrite in vercel.json and would serve the homepage shell: ${missing.join(', ')}`
      )
    }
    // eslint-disable-next-line no-console
    console.log(`[routes] ${Object.keys(PUBLIC_ROUTES).length} public routes, all reachable`)
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

    // ─── THE APP SHELL, SPLIT OFF FROM THE HOMEPAGE ──────────────────────────
    //
    // Added 2026-09-08, the same day the homepage was prerendered, because the
    // two changes are the same change. index.html was both the homepage AND the
    // catch-all destination in vercel.json, so the moment real landing-page copy
    // went into it, every URL that does not exist started answering 200 with a
    // full copy of the homepage. wovely.app/anything-at-all was a duplicate of
    // wovely.app. On a site with two URLs indexed, an infinite space of
    // indexable near-duplicates is worse than the empty div it replaced.
    //
    // So the catch-all now points here instead: the same shell, the same bundle,
    // an empty #root, and noindex. A signed-in user opening /hive or a shared
    // /pattern/:id link gets exactly what they got before. A crawler gets told
    // not to index a page that is not a page.
    //
    // This does NOT make an unknown path return 404 — Vercel rewrites cannot set
    // a status, and returning a real 404 would mean enumerating every client
    // route in vercel.json, where one missed path is a hard 404 for a person
    // holding a shared link. That trade is not worth it. noindex removes the
    // indexing harm, which was the part that cost anything.
    const appShell = template
      .replace(/<link rel="canonical"[^>]*>\s*/, '')
      .replace(/<link rel="alternate"[^>]*hreflang="en"[^>]*>\s*/, '')
      .replace('</head>', '  <meta name="robots" content="noindex, follow" />\n  </head>')
    fs.writeFileSync(path.join(outDir, 'app.html'), appShell, 'utf8')

    // The rewrite and the file have to agree, and nothing else checks that. If
    // this destination is ever renamed, every path that is not one of the ten
    // public routes becomes a hard 404 for a real user, which is the failure
    // this whole build step exists to avoid causing.
    const vercelCfg = JSON.parse(fs.readFileSync(path.resolve('vercel.json'), 'utf8'))
    const fallback = (vercelCfg.rewrites || []).at(-1)
    if (!fallback || fallback.destination !== '/app.html') {
      this.error(
        `[seo] the last rewrite in vercel.json must be the catch-all pointing at /app.html, found: ${fallback ? fallback.destination : 'nothing'}`
      )
    }

    // eslint-disable-next-line no-console
    console.log(`[seo] wrote app.html (noindex shell) for the catch-all rewrite`)
    // eslint-disable-next-line no-console
    console.log(`[seo] wrote per-route heads: ${written.join(', ')}`)
    // eslint-disable-next-line no-console
    console.log(`[seo] wrote sitemap.xml with ${Object.keys(PUBLIC_ROUTES).length} URLs`)
  },
})

// ─── SERVICE WORKER ──────────────────────────────────────────────────────────
//
// Compiles src/service-worker.js into dist/sw.js, substituting the build id and
// the precache list. The worker itself explains its caching strategy; this only
// explains why it is generated rather than written by hand.
//
// Two things have to be true at build time and cannot be hard-coded:
//
// 1. THE PRECACHE LIST HAS TO NAME REAL, CURRENT FILES. Vite content-hashes
//    every chunk, so the names change on each build. A hand-kept list would be
//    wrong the first time anyone edited a component.
//
// 2. THE FILE'S BYTES HAVE TO CHANGE WHEN THE BUILD CHANGES. A browser decides
//    whether to install a new worker by byte-comparing sw.js against the one it
//    has. A worker that is byte-identical across deploys is never reinstalled,
//    so its caches are never rebuilt and its precache keeps serving the
//    previous build's assets. The build id below is a hash of the emitted asset
//    names plus the worker source, which means it changes exactly when
//    something it caches changed, and does not change when nothing did.
//
// It runs after seoHeadPrerender because the precache list includes the public
// route URLs, and that plugin is what writes their HTML.
const pwaServiceWorker = () => ({
  name: 'wovely-pwa-service-worker',
  apply: 'build',
  closeBundle() {
    const outDir = path.resolve('dist')
    const assetsDir = path.join(outDir, 'assets')
    if (!fs.existsSync(assetsDir)) return

    const templatePath = path.resolve('src/service-worker.js')
    const template = fs.readFileSync(templatePath, 'utf8')

    // Each token must appear exactly once. Merely checking `includes` is not
    // enough: the first cut of this plugin used String.replace with a string
    // pattern (first match only) while the token was also mentioned in the
    // template's header comment, so the substitution landed in the prose and
    // the real assignment shipped as `PRECACHE_URLS = __PRECACHE__`, an
    // undeclared identifier that throws on registration. The build still
    // printed "wrote sw.js". Count, then substitute, then verify.
    const TOKENS = ['__BUILD_ID__', '__PRECACHE__']
    for (const token of TOKENS) {
      const n = template.split(token).length - 1
      if (n !== 1) {
        this.error(
          `[pwa] src/service-worker.js must contain ${token} exactly once, found ${n}`
        )
      }
    }

    // Only the hashed JS and CSS. Anything else in /assets (an inlined image,
    // say) is fetched on demand rather than paid for up front on every install.
    const hashedAssets = fs
      .readdirSync(assetsDir)
      .filter((f) => /-[A-Za-z0-9_-]{8,}\.(js|css)$/.test(f))
      .map((f) => `/assets/${f}`)
      .sort()

    // Route URLs, not filenames: /tools is a rewrite to /tools.html, and the
    // browser asks for /tools. Caching the filename would cache a URL nobody
    // ever requests. /app.html is the exception, because it is the offline
    // fallback and is fetched by that literal path.
    const routeUrls = Object.keys(PUBLIC_ROUTES)
    const precache = [
      ...routeUrls,
      '/app.html',
      '/manifest.webmanifest',
      '/icons/icon-192.png',
      '/icons/icon-512.png',
      '/icons/maskable-192.png',
      '/icons/maskable-512.png',
      // The header logo on every public page. Verified offline with the server
      // stopped: without this the calculators rendered and computed correctly
      // but the brand mark in the top-left was a broken-image icon, which
      // reads as "the app is broken" rather than "you are offline".
      // NOTE: this file is 237 kB and is displayed at 34 px. That is a
      // pre-existing weight problem on every page load, not something this
      // plugin introduced, and it is worth fixing at the markup level rather
      // than here.
      '/bev_neutral.png',
      ...hashedAssets,
    ]

    const buildId = crypto
      .createHash('sha256')
      .update(hashedAssets.join('|'))
      .update(template)
      .digest('hex')
      .slice(0, 12)

    const sw = template
      .replaceAll('__BUILD_ID__', buildId)
      .replaceAll('__PRECACHE__', JSON.stringify(precache, null, 2))

    // The check that would have caught the bug described above. A worker that
    // still carries a placeholder is not a worker, it is a syntax error that
    // silently disables offline mode, and the only symptom is a console
    // warning on someone else's phone.
    const survivors = TOKENS.filter((t) => sw.includes(t))
    if (survivors.length) {
      this.error(`[pwa] placeholders survived substitution into dist/sw.js: ${survivors.join(', ')}`)
    }

    fs.writeFileSync(path.join(outDir, 'sw.js'), sw, 'utf8')

    // eslint-disable-next-line no-console
    console.log(
      `[pwa] wrote sw.js (build ${buildId}) precaching ${routeUrls.length} routes and ${hashedAssets.length} hashed assets`
    )

    // A manifest that 404s makes the install prompt silently never appear, and
    // there is nothing in the browser UI that says why. Fail the build instead.
    const manifest = path.join(outDir, 'manifest.webmanifest')
    if (!fs.existsSync(manifest)) {
      this.error('[pwa] dist/manifest.webmanifest is missing — the app is not installable')
    }
    const icons = JSON.parse(fs.readFileSync(manifest, 'utf8')).icons || []
    const missingIcons = icons
      .map((i) => i.src)
      .filter((src) => !fs.existsSync(path.join(outDir, src.replace(/^\//, ''))))
    if (missingIcons.length) {
      this.error(`[pwa] manifest names icons that were not built: ${missingIcons.join(', ')}`)
    }
    // eslint-disable-next-line no-console
    console.log(`[pwa] manifest present with ${icons.length} icons, all files exist`)
  },
})

export default defineConfig({
  plugins: [react(), firstRunGate(), routeReachabilityGate(), seoHeadPrerender(), pwaServiceWorker()],
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
