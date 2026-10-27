const QUERIES = [
  'site:upi.com/Odd_News OR site:upi.com/Top_News weird unusual when:14d',
  '"odd news" OR "weird news" United States when:14d',
  'bizarre unusual surprising people United States news when:14d',
  'unexpected workplace workers gaming time off United States when:30d',
  'strange animals unusual discoveries US news when:14d',
  'site:apnews.com/hub/oddities OR site:apnews.com oddities when:14d',
  'funny unusual real life human interest America when:14d'
];
const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};
function response(status, body) { return new Response(JSON.stringify(body), { status, headers }); }
function decodeXml(text = '') {
  return String(text).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, ' ').trim();
}
function tag(xml, name) {
  const m = xml.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>', 'i'));
  return m ? decodeXml(m[1]) : '';
}
function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; }
  catch { return ''; }
}
function normalizeTitle(title) { return title.toLowerCase().replace(/\s+-\s+[^-]{2,70}$/, '').replace(/[^a-z0-9]+/g, ' ').trim(); }
function simpleHash(value) { let h = 2166136261; for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }
async function fetchFeed(query) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-US&gl=US&ceid=US:en';
  const res = await fetch(url, { headers: { 'User-Agent': 'REMOTE-NewsPreview/1.0 (RSS reader)' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error('Google News RSS HTTP ' + res.status);
  const xml = await res.text();
  const blocks = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)].map(m => m[1]);
  const candidates = blocks.map(block => {
    const title = tag(block, 'title');
    const link = safeUrl(tag(block, 'link'));
    const description = tag(block, 'description');
    const publishedAt = tag(block, 'pubDate');
    let source = tag(block, 'source');
    if (!source && link) { try { source = new URL(link).hostname.replace(/^www\./, ''); } catch {} }
    return { id: '', title: title.replace(/\s+-\s+[^-]{2,70}$/, '').trim(), description: description.slice(0,1200), url: link, source: source.slice(0,100), publishedAt, query };
  }).filter(item => item.title && item.url);
  return { url, count: candidates.length, candidates };
}
export default async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'GET') return response(405, { error: 'Method not allowed.' });
  const results = await Promise.all(QUERIES.map(async query => {
    try { return { query, ok: true, ...(await fetchFeed(query)) }; }
    catch (e) { return { query, ok: false, count: 0, candidates: [], error: String(e.message || e) }; }
  }));
  const all = results.flatMap(item => item.candidates);
  const seen = new Set();
  const unique = [];
  for (const item of all) {
    const k = normalizeTitle(item.title) || item.url;
    if (!k || seen.has(k)) continue;
    seen.add(k);
    const date = Date.parse(item.publishedAt);
    if (Number.isFinite(date) && date < Date.now() - 30 * 86400000) continue;
    item.id = 's' + unique.length + '-' + simpleHash(item.url + item.title);
    unique.push(item);
  }
  unique.sort((a,b)=>(Date.parse(b.publishedAt)||0)-(Date.parse(a.publishedAt)||0));
  const limit = Math.min(60,Math.max(5,Number(new URL(request.url).searchParams.get('limit'))||60));
  return response(200,{candidates:unique.slice(0,limit),count:Math.min(unique.length,limit),totalUnique:unique.length,queries:results.map(item=>({query:item.query,ok:item.ok,count:item.count,error:item.error||null})),warnings:results.some(item=>!item.ok)?['Some RSS searches failed; results may be incomplete.']:[],fetchedAt:new Date().toISOString()});
};
