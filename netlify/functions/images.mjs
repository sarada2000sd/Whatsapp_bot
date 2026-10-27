const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=1800'
};
function response(status, body) { return new Response(JSON.stringify(body), { status, headers }); }
export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return response(405, { error: 'Method not allowed.' });
  const incoming = new URL(request.url);
  const query = (incoming.searchParams.get('q') || '').trim().slice(0, 180);
  if (!query) return response(400, { error: 'A photo search query is required.' });
  const pageSize = Math.min(20, Math.max(5, Number(incoming.searchParams.get('limit')) || 18));
  const api = new URL('https://api.openverse.org/v1/images/');
  api.searchParams.set('q', query);
  api.searchParams.set('page_size', String(pageSize));
  api.searchParams.set('page', '1');
  api.searchParams.set('license_type', 'commercial');
  api.searchParams.set('aspect_ratio', 'wide');
  api.searchParams.set('size', 'large');
  api.searchParams.set('category', 'photograph');
  api.searchParams.set('filter_dead', 'true');
  try {
    const res = await fetch(api, { headers: { 'User-Agent': 'REMOTE-NewsPreview/1.0 (licensed image discovery)' }, signal: AbortSignal.timeout(12000) });
    const data = await res.json();
    if (!res.ok) return response(res.status === 429 ? 429 : 502, { error: 'Openverse returned HTTP ' + res.status + '. Check rate limits and retry.', detail: data.detail || data.message || null });
    const results = (data.results || []).filter(item => item.url && item.foreign_landing_url && item.license_url && ['cc0', 'pdm', 'by'].includes(String(item.license).toLowerCase())).map(item => ({
      id: item.id, title: item.title || 'Untitled photograph', creator: item.creator || 'Creator not listed',
      provider: item.provider || '', source: item.source || '', url: item.url, thumbnail: item.thumbnail || item.url,
      foreign_landing_url: item.foreign_landing_url, license: item.license, license_version: item.license_version || '',
      license_url: item.license_url, attribution: item.attribution || '', width: item.width || null, height: item.height || null
    }));
    return response(200, { query, count: results.length, results, warnings: (data.results || []).length && !results.length ? ['Openverse returned results, but none passed the automatic commercial-use licence filter.'] : [] });
  } catch (e) {
    return response(502, { error: 'Could not reach Openverse: ' + String(e.message || e) });
  }
};
