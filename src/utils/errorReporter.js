// src/utils/errorReporter.js
// Where a JavaScript error a real person saw is reported from.
//
// It sends the pulse session id along with the error. That single field is
// what lets the monitor tell Adam whether the visitor shrugged the error off
// and kept browsing or whether it ended their visit, which are two very
// different pieces of news. It is the same opaque per-tab id the beacon uses:
// not an identity, and gone when the tab closes.

import { pulseSessionId } from './pulse.js';

let _userId = null;

export function setErrorReporterUser(id) {
  _userId = id;
}

/** Never let the reporter be the thing that throws. */
function safeSid() {
  try {
    return pulseSessionId();
  } catch {
    return null;
  }
}

function report(message, source, stack, extra = {}) {
  // Fire and forget — never block the UI
  fetch('/api/client-error', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      source,
      stack,
      user_id: _userId,
      context: {
        url: window.location.href,
        userAgent: navigator.userAgent,
        sid: safeSid(),
        ...extra
      }
    })
  }).catch(() => {}); // swallow network errors silently
}

// Public helper for reporting a HANDLED (caught) error from anywhere in the app.
// Reuses the same /api/client-error sink + user context as the global handlers,
// so swallowed failures (e.g. the lazy chart render) become observable in the
// logs instead of dying in a console.warn. `context` fields are persisted under
// the log row's context jsonb.
export function reportClientError(message, context = {}) {
  report(message, context.source || 'handled', context.stack || null, context);
}

export function initErrorReporter() {
  window.onerror = function(message, source, lineno, colno, error) {
    report(
      message,
      `${source}:${lineno}:${colno}`,
      error?.stack || null
    );
    return false; // don't suppress default browser behavior
  };

  window.addEventListener('unhandledrejection', function(event) {
    report(
      event.reason?.message || String(event.reason),
      'unhandledrejection',
      event.reason?.stack || null
    );
  });
}
