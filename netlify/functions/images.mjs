const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=1800'
};
const ALLOWED_LICENSES = new Set(['cc0', 'pdm', 'by']);
const STOP_WORDS = new Set(['the','and','for','with','from','this','that','about','into','over','under','after','before','people','person','photo','photograph','image','images','picture','news','story','real','actual','recent','unusual','funny','strange','surprising','unexpected','event','events']);
function response(status, body) { return new Response(JSON.stringify(body), { status, headers }); }
function safeHttps(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : '';
  } catch { return ''; }
}
function simplify(query) {
  const words = String(query).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word));
  const result = [...new Set(words)].slice(0, 5).join(' ');
  return result || String(query).trim().split(/\s+/).slice(0, 3).join(' ');
}
function accepted(item) {
  const license = String(item.license || '').toLowerCase();
  return ALLOWED_LICENSES.has(license) && safeHttps(item.url) && safeHttps(item.foreign_landing_url) && safeHttps(item.license_url);
}
function normalized(item) {
  return {
    id: item.id, title: item.title || 'Untitled photograph', creator: item.creator || 'Creator not listed',
    provider: item.provider || '', source: item.source || '', url: safeHttps(item.url),
    thumbnail: safeHttps(item.thumbnail) || safeHttps(item.url), foreign_landing_url: safeHttps(item.foreign_landing_url),
    license: String(item.license || '').toLowerCase(), license_version: item.license_version || '',
    license_url: safeHttps(item.license_url), attribution: item.attribution || '',
    width: item.width || null, height: item.height || null
  };
}
async function runSearch(query, filters, pageSize) {
  const api = new URL('https://api.openverse.org/v1/images/');
  api.searchParams.set('q', query);
  api.searchParams.set('page_size', String(pageSize));
  api.searchParams.set('page', '1');
  // Explicitly request only licences that can be used commercially for a transformed graphic.
  // CC BY requires attribution; CC0 and PDM are public-domain options.
  api.searchParams.set('license', 'cc0,pdm,by');
  api.searchParams.set('filter_dead', 'true');
  for (const [key, value] of Object.entries(filters)) api.searchParams.set(key, value);
  const res = await fetch(api, {
    headers: { 'User-Agent': 'REMOTE-NewsPreview/1.1 (licensed image discovery)' },
    signal: AbortSignal.timeout(12000)
  });
  let data;
  try { data = await res.json(); } catch { data = {}; }
  if (!res.ok) throw new Error('Openverse HTTP ' + res.status + ': ' + (data.detail || data.message || 'Request failed'));
  return { data, url: api.toString() };
}
export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return response(405, { error: 'Method not allowed.' });
  const incoming = new URL(request.url);
  const query = (incoming.searchParams.get('q') || '').trim().slice(0, 180);
  if (!query) return response(400, { error: 'A photo search query is required.' });
  const pageSize = Math.min(20, Math.max(5, Number(incoming.searchParams.get('limit')) || 18));
  const compact = simplify(query);
  const terms = [...new Set([query, compact])];
  const strategies = [
    { name: 'wide-large-photograph', filters: { aspect_ratio: 'wide', size: 'large', category: 'photograph' } },
    { name: 'wide-any-size', filters: { aspect_ratio: 'wide' } },
    { name: 'any-aspect-commercial-photo', filters: {} }
  ];
  const candidates = new Map();
  const attempts = [];
  let lastError = '';
  for (let termIndex = 0; termIndex < terms.length; termIndex++) {
    const term = terms[termIndex];
    for (let strategyIndex = 0; strategyIndex < strategies.length; strategyIndex++) {
      // Start strict for the original query. When it is too narrow, retry short keywords and then relax dimensions.
      if (termIndex === 1 && term === query) continue;
      const strategy = strategies[strategyIndex];
      if (termIndex === 1 && strategyIndex === 0 && term === query) continue;
      try {
        const { data } = await runSearch(term, strategy.filters, pageSize);
        const raw = data.results || [];
        const eligible = raw.filter(accepted).map(normalized);
        for (const item of eligible) {
          const key = String(item.id || item.url);
          if (!candidates.has(key)) candidates.set(key, item);
        }
        attempts.push({ query: term, filters: strategy.name, returned: raw.length, eligible: eligible.length });
        // Return a useful set without exhausting the anonymous API quota on every request.
        if (candidates.size >= 8) break;
      } catch (error) {
        lastError = String(error.message || error);
        attempts.push({ query: term, filters: strategy.name, returned: 0, eligible: 0, error: lastError });
        if (/HTTP 429/.test(lastError)) {
          return response(429, { error: 'Openverse rate limit reached. Wait and retry.', detail: lastError, query, attempts });
        }
      }
    }
    if (candidates.size >= 8) break;
  }
  const results = [...candidates.values()].slice(0, 18);
  if (!results.length && attempts.length && attempts.every(attempt => attempt.error)) {
    return response(502, { error: 'Every Openverse photo search attempt failed.', detail: lastError, query, attempts });
  }
  return response(200, {
    query, count: results.length, results, attempts,
    searchUsed: [...new Set(attempts.map(a => a.query))],
    totalReturnedByOpenverse: attempts.reduce((sum, attempt) => sum + (attempt.returned || 0), 0),
    warnings: !results.length
      ? ['No results passed the CC0/Public Domain/CC BY commercial-use filter after fallback searches.']
      : results.length < 4
        ? ['Only a few eligible images were found. The search may need broader terms.']
        : []
  });
};
