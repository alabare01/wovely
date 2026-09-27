// api/_providerRouter.js
// Shared utility — NOT a Vercel route (underscore prefix)
// Returns 'gemini' or 'haiku' based on Gemini health cache

const GEMINI_MODEL = 'gemini-2.5-flash';
const PROBE_TIMEOUT_MS = 5000;
// 2026-09-27: the Anthropic org is disabled, so routing to 'haiku' on a failed
// probe sends every import to a provider that answers 400 and the job dies without
// Gemini ever being tried (probe-pdf-import failed this way at 12:00Z). Until the
// org is restored, a failed probe still returns 'gemini'. Set ANTHROPIC_AVAILABLE=1
// in Vercel to bring back the probe-driven switch to Claude.
const CLAUDE_AVAILABLE = process.env.ANTHROPIC_AVAILABLE === '1';
const CACHE_HEALTHY_MS = 60000;
const CACHE_DEGRADED_MS = 30000;

const healthCache = {
  provider: null,
  cachedAt: 0,
  ttl: 0,
};

async function probeGemini(geminiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'respond with the word OK' }] }],
          generationConfig: { maxOutputTokens: 5, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );
    clearTimeout(timeout);
    return r.ok;
  } catch {
    clearTimeout(timeout);
    return false;
  }
}

export async function getPreferredProvider(geminiKey) {
  const now = Date.now();
  const cacheAge = now - healthCache.cachedAt;

  if (healthCache.provider && cacheAge < healthCache.ttl) {
    console.log(`[providerRouter] Cache hit: ${healthCache.provider} (age ${cacheAge}ms, ttl ${healthCache.ttl}ms)`);
    return healthCache.provider;
  }

  console.log('[providerRouter] Probing Gemini health...');
  const geminiHealthy = await probeGemini(geminiKey);
  const provider = geminiHealthy || !CLAUDE_AVAILABLE ? 'gemini' : 'haiku';
  if (!geminiHealthy && !CLAUDE_AVAILABLE) console.warn('[providerRouter] Gemini probe failed but Claude is unavailable: staying on gemini');
  const ttl = geminiHealthy ? CACHE_HEALTHY_MS : CACHE_DEGRADED_MS;

  healthCache.provider = provider;
  healthCache.cachedAt = now;
  healthCache.ttl = ttl;

  console.log(`[providerRouter] Probe result: ${provider} — cached for ${ttl}ms`);
  return provider;
}
