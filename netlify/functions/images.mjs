const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=900'
};
const ALLOWED_LICENSES = new Set(['cc0', 'pdm', 'by', 'by-sa']);
const STOP_WORDS = new Set(['the','and','for','with','from','this','that','about','into','over','under','after','before','people','person','photo','photograph','image','images','picture','news','story','real','actual','recent','unusual','funny','strange','surprising','unexpected','event','events','video','game','gaming']);
function response(status, body) { return new Response(JSON.stringify(body), { status, headers }); }
function safeHttps(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol === 'https:' && !parsed.username && !parsed.password) return parsed.href;
    if (parsed.protocol === 'http:' && ['creativecommons.org','www.creativecommons.org','commons.wikimedia.org','www.wikimedia.org'].includes(parsed.hostname.toLowerCase())) {
      parsed.protocol = 'https:'; return parsed.href;
    }
    return '';
  } catch { return ''; }
}
function htmlText(value = '') {
  return String(value).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}
function simplify(query) {
  const words = String(query).toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/)
    .filter(word => word.length >= 3 && !STOP_WORDS.has(word));
  return [...new Set(words)].slice(0, 5).join(' ') || String(query).trim().split(/\s+/).slice(0, 3).join(' ');
}
function landscape(width, height) {
  const w = Number(width) || 0, h = Number(height) || 0;
  // Unknown dimensions remain candidates; the renderer safely crops the real image.
  return !w || !h || w > h;
}
function licenseCode(value) {
  const license = String(value || '').trim().toLowerCase().replace(/_/g, '-');
  if (license === 'cc0' || /\bcc0\b/.test(license)) return 'cc0';
  if (license === 'pdm' || /public.?domain|public domain mark/.test(license)) return 'pdm';
  if (license === 'by-sa' || /\bcc\s*by[- ]sa\b/.test(license) || /attribution-sharealike/.test(license)) return 'by-sa';
  if (license === 'by' || license === 'cc-by' || /\bcc\s*by(?:\s|$|[0-9])/.test(license) || /creative commons attribution/.test(license)) {
    if (/\b(nc|nd)\b|non.?commercial|no.?derivatives/.test(license)) return '';
    return 'by';
  }
  return '';
}
function openverseItem(item) {
  const license = licenseCode(item.license);
  const url = safeHttps(item.url), page = safeHttps(item.foreign_landing_url), licenseUrl = safeHttps(item.license_url);
  if (!ALLOWED_LICENSES.has(license) || !url || !page || !licenseUrl || !landscape(item.width, item.height)) return null;
  return {
    id: item.id || url, title: htmlText(item.title || 'Untitled photograph'), creator: htmlText(item.creator || 'Creator not listed'),
    provider: 'Openverse', source: item.source || item.provider || 'Openverse', url, thumbnail: safeHttps(item.thumbnail) || url,
    foreign_landing_url: page, license, license_label: license, license_version: item.license_version || '',
    license_url: licenseUrl, attribution: htmlText(item.attribution || ''),
    width: Number(item.width) || null, height: Number(item.height) || null
  };
}
function commonsLicense(info) {
  const ext = info.extmetadata || {};
  const shortName = htmlText((ext.LicenseShortName || {}).value || (ext.UsageTerms || {}).value || '');
  const code = licenseCode(shortName);
  if (!ALLOWED_LICENSES.has(code)) return null;
  const licenseUrl = safeHttps((ext.LicenseUrl || {}).value || '') || 'https://commons.wikimedia.org/wiki/Commons:Licensing';
  return { code, label: shortName || code, url: licenseUrl, artist: htmlText((ext.Artist || {}).value || (ext.Credit || {}).value || 'Creator not listed'), attribution: htmlText((ext.Attribution || {}).value || '') };
}
function commonsItem(page) {
  const info = (page.imageinfo || [])[0];
  if (!info || !landscape(info.width, info.height)) return null;
  const mime = String(info.mime || '').toLowerCase();
  if (mime && !['image/jpeg','image/png','image/webp','image/avif'].includes(mime)) return null;
  const licence = commonsLicense(info);
  if (!licence) return null;
  const pageUrl = 'https://commons.wikimedia.org/wiki/' + encodeURIComponent(String(page.title || '').replace(/ /g, '_')).replace(/%3A/gi, ':');
  const fileUrl = safeHttps(info.thumburl) || safeHttps(info.url);
  if (!fileUrl) return null;
  return {
    id: 'commons-' + (page.pageid || page.title), title: htmlText(String(page.title || 'Wikimedia Commons image').replace(/^File:/, '')),
    creator: licence.artist || 'Creator not listed', provider: 'Wikimedia Commons', source: 'Wikimedia Commons',
    url: fileUrl, thumbnail: fileUrl, foreign_landing_url: pageUrl, license: licence.code,
    license_label: licence.label, license_version: '', license_url: licence.url, attribution: licence.attribution,
    width: Number(info.thumbwidth || info.width) || null, height: Number(info.thumbheight || info.height) || null
  };
}
async function openverseSearch(query, pageSize) {
  const api = new URL('https://api.openverse.org/v1/images/');
  api.searchParams.set('q', query);
  api.searchParams.set('page_size', String(pageSize));
  api.searchParams.set('page', '1');
  // No narrow licence, aspect-ratio, size, or category parameters are sent to Openverse.
  const res = await fetch(api, { headers: { 'User-Agent': 'REMOTE-NewsPreview/1.2 (licensed image discovery)' }, signal: AbortSignal.timeout(12000) });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) throw new Error('Openverse HTTP ' + res.status + ': ' + htmlText(data.detail || data.message || data.error || 'Request failed').slice(0, 220));
  const raw = data.results || [];
  return { results: raw.map(openverseItem).filter(Boolean), returned: raw.length };
}
async function commonsSearch(query, pageSize) {
  const api = new URL('https://commons.wikimedia.org/w/api.php');
  api.searchParams.set('action', 'query'); api.searchParams.set('generator', 'search');
  api.searchParams.set('gsrsearch', query + ' filetype:bitmap'); api.searchParams.set('gsrnamespace', '6');
  api.searchParams.set('gsrlimit', String(Math.min(50, Math.max(20, pageSize * 2))));
  api.searchParams.set('prop', 'imageinfo'); api.searchParams.set('iiprop', 'url|size|mime|extmetadata');
  api.searchParams.set('iiurlwidth', '1600'); api.searchParams.set('format', 'json'); api.searchParams.set('formatversion', '2');
  const res = await fetch(api, { headers: { 'User-Agent': 'REMOTE-NewsPreview/1.2 (news image search; public Wikimedia API)' }, signal: AbortSignal.timeout(15000) });
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok || data.error) throw new Error('Wikimedia Commons HTTP ' + res.status + ': ' + htmlText((data.error || {}).info || 'Request failed').slice(0, 220));
  const pages = Array.isArray(data.query && data.query.pages) ? data.query.pages : Object.values((data.query && data.query.pages) || {});
  return { results: pages.map(commonsItem).filter(Boolean), returned: pages.length };
}
export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return response(405, { error: 'Method not allowed.' });
  const incoming = new URL(request.url), query = (incoming.searchParams.get('q') || '').trim().slice(0, 180);
  if (!query) return response(400, { error: 'A photo search query is required.' });
  const pageSize = Math.min(20, Math.max(5, Number(incoming.searchParams.get('limit')) || 18));
  const terms = [...new Set([query, simplify(query)].filter(Boolean))], results = new Map(), attempts = [];
  const providers = { Openverse: 0, 'Wikimedia Commons': 0 };
  for (const term of terms) {
    try {
      const result = await openverseSearch(term, pageSize);
      attempts.push({ provider: 'Openverse', query: term, returned: result.returned, eligible: result.results.length, status: 'ok' });
      for (const item of result.results) if (!results.has(String(item.id || item.url))) results.set(String(item.id || item.url), item);
      providers.Openverse = [...results.values()].filter(item => item.provider === 'Openverse').length;
      if (providers.Openverse >= 8) break;
    } catch (error) {
      attempts.push({ provider: 'Openverse', query: term, returned: 0, eligible: 0, status: 'error', error: String(error.message || error) });
    }
  }
  let fallbackUsed = false;
  if (results.size < 8) {
    fallbackUsed = true;
    for (const term of terms) {
      try {
        const result = await commonsSearch(term, pageSize);
        attempts.push({ provider: 'Wikimedia Commons', query: term, returned: result.returned, eligible: result.results.length, status: 'ok' });
        for (const item of result.results) if (!results.has(String(item.id || item.url))) results.set(String(item.id || item.url), item);
        providers['Wikimedia Commons'] = [...results.values()].filter(item => item.provider === 'Wikimedia Commons').length;
        if (providers['Wikimedia Commons'] >= 8) break;
      } catch (error) {
        attempts.push({ provider: 'Wikimedia Commons', query: term, returned: 0, eligible: 0, status: 'error', error: String(error.message || error) });
      }
    }
  }
  const all = [...results.values()].slice(0, pageSize);
  const hasError = attempts.some(item => item.status === 'error');
  const warnings = !all.length
    ? ['No landscape photos with known CC0/Public Domain/CC BY/CC BY-SA licences were found. See attempts for exact provider errors.']
    : hasError ? ['One image provider failed; images from the other source are still available. Check each displayed licence.'] : [];
  return response(200, { query, count: all.length, results: all, attempts, providers: [
    { provider: 'Openverse', count: providers.Openverse }, { provider: 'Wikimedia Commons', count: providers['Wikimedia Commons'] }
  ], fallbackUsed, fetchedAt: new Date().toISOString(), warnings });
};
