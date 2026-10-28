import test from 'node:test';
import assert from 'node:assert/strict';
import news from '../netlify/functions/news.mjs';
import images from '../netlify/functions/images.mjs';
import article from '../netlify/functions/article.mjs';
import imageProxy from '../netlify/functions/image-proxy.mjs';
const originalFetch = globalThis.fetch;

test('news endpoint parses RSS and normalizes candidate titles', async () => {
  const xml = '<?xml version="1.0"?><rss><channel><item><title>Penguin surprises visitors - Example News</title><link>https://example.com/story</link><description>A detailed story about a surprising penguin event with enough context.</description><pubDate>' + new Date().toUTCString() + '</pubDate><source>Example News</source></item></channel></rss>';
  globalThis.fetch = async () => new Response(xml, {status:200,headers:{'Content-Type':'application/rss+xml'}});
  try {
    const response = await news(new Request('https://local.test/api/news?limit=60'));
    const data = await response.json();
    assert.equal(response.status,200);
    assert.equal(data.count,1);
    assert.equal(data.candidates[0].title,'Penguin surprises visitors');
    assert.equal(data.candidates[0].source,'Example News');
    assert.equal(data.queries.filter(query => query.ok).length,7);
  } finally { globalThis.fetch = originalFetch; }
});

test('Openverse uses explicit commercially usable licences and falls back when strict search has no photos', async () => {
  const requests = [];
  globalThis.fetch = async url => {
    const parsed = new URL(String(url));
    requests.push(parsed);
    assert.equal(parsed.searchParams.get('license'),'cc0,pdm,by');
    assert.equal(parsed.searchParams.get('filter_dead'),'true');
    if (parsed.searchParams.has('size') && parsed.searchParams.has('category')) {
      return new Response(JSON.stringify({result_count:0,results:[]}), {status:200,headers:{'Content-Type':'application/json'}});
    }
    return new Response(JSON.stringify({result_count:3,results:[
      {id:'ok',title:'Licensed photo',url:'https://images.example/photo.jpg',thumbnail:'https://images.example/thumb.jpg',foreign_landing_url:'https://example.com/photo',license:'by',license_url:'https://creativecommons.org/licenses/by/4.0/',width:1600,height:900},
      {id:'public',title:'Public domain photo',url:'https://images.example/public.jpg',thumbnail:'https://images.example/public-thumb.jpg',foreign_landing_url:'https://example.com/public',license:'pdm',license_url:'https://creativecommons.org/publicdomain/mark/1.0/'},
      {id:'nc',title:'Noncommercial photo must not pass',url:'https://images.example/nc.jpg',foreign_landing_url:'https://example.com/nc',license:'by-nc',license_url:'https://creativecommons.org/licenses/by-nc/4.0/'}
    ]}), {status:200,headers:{'Content-Type':'application/json'}});
  };
  try {
    const response = await images(new Request('https://local.test/api/images?q=workplace&limit=8'));
    const data = await response.json();
    assert.equal(response.status,200);
    assert.equal(data.count,2);
    assert.ok(requests.length>=2);
    assert.equal(data.attempts[0].filters,'wide-large-photograph');
    assert.equal(data.results.some(item=>item.license==='by-nc'),false);
    assert.equal(data.results.some(item=>item.license==='by'),true);
  } finally { globalThis.fetch = originalFetch; }
});

test('Openverse skips insecure image URLs and reports empty fallback diagnostics', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({results:[{id:'http',title:'Insecure',url:'http://images.example/photo.jpg',foreign_landing_url:'https://example.com/photo',license:'by',license_url:'https://creativecommons.org/licenses/by/4.0/'}]}), {status:200,headers:{'Content-Type':'application/json'}});
  try {
    const response = await images(new Request('https://local.test/api/images?q=rarely-used-subject&limit=8'));
    const data = await response.json();
    assert.equal(response.status,200);
    assert.equal(data.count,0);
    assert.ok(data.attempts.length>=1);
    assert.ok(data.warnings[0].includes('No results passed'));
  } finally { globalThis.fetch = originalFetch; }
});

test('article reader and image proxy reject unsafe local URLs', async () => {
  const articleResponse = await article(new Request('https://local.test/api/article?url=http%3A%2F%2Flocalhost%2Fsecret'));
  const imageResponse = await imageProxy(new Request('https://local.test/api/image-proxy?url=https%3A%2F%2Flocalhost%2Fsecret.jpg'));
  assert.equal(articleResponse.status,400);
  assert.equal(imageResponse.status,400);
});
