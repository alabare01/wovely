// api/_providerRouter.js
// Shared utility — NOT a Vercel route (underscore prefix)
// Returns 'gemini' or 'haiku' based on Gemini health cache

const GEMINI_MODEL = 'gemini-2.5-flash';
const PROBE_TIMEOUT_MS = 2000;
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
  const provider = geminiHealthy ? 'gemini' : 'haiku';
  const ttl = geminiHealthy ? CACHE_HEALTHY_MS : CACHE_DEGRADED_MS;

  healthCache.provider = provider;
  healthCache.cachedAt = now;
  healthCache.ttl = ttl;

  console.log(`[providerRouter] Probe result: ${provider} — cached for ${ttl}ms`);
  return provider;
}
