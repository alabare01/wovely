import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import posthog from 'posthog-js'
import App from './App.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import { isNoReplayPath } from './utils/analytics.js'
import { startPulseSession } from './utils/pulse.js'
import { registerServiceWorker } from './utils/serviceWorker.js'
import { initNative } from './utils/native.js'
import './index.css'

// Prevent browser from restoring scroll position on back/forward (iOS bfcache)
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Session replay is off on the public tool pages: a reader pastes a pattern
// there and the page promises it does not leave their browser. See
// src/utils/analytics.js for the full reasoning.
posthog.init('phc_CgK3ydJGk6XRtRPLQ8cnXxkqSroQBsuYrV9VsWk2r76Y', {
  api_host: 'https://us.i.posthog.com',
  person_profiles: 'identified_only',
  capture_pageview: true,
  capture_pageleave: true,
  disable_session_recording: isNoReplayPath(),
});

// Tell the monitor a person arrived. Signups already emailed Adam; the much
// larger group who show up and never sign up were invisible, and at ~49
// visitors a month that group IS the business. Fires once per tab, carries a
// path and a referring hostname and nothing else, and cannot throw.
// See src/utils/pulse.js and api/_monitor.js.
startPulseSession();

// Native shell setup: safe-area viewport, deep links, Android back button and
// the system-browser OAuth handler. No-ops in a browser. Runs BEFORE mount so
// the viewport and the wv-native class are in place for the first paint.
initNative()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <App />
    </BrowserRouter>
  </React.StrictMode>
)

// Installable / offline support. Production web only: it no-ops in dev and
// inside the Capacitor native shell. See src/utils/serviceWorker.js.
registerServiceWorker()
