let _userId = null;

export function setErrorReporterUser(id) {
  _userId = id;
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
