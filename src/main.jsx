import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import posthog from 'posthog-js'
import App from './App.jsx'
import ScrollToTop from './components/ScrollToTop.jsx'
import { isNoReplayPath } from './utils/analytics.js'
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

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ScrollToTop />
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
