import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
test('Netlify app and backend endpoints exist',()=>{assert.ok(existsSync('index.html'));for(const name of ['news','images','article','image-proxy'])assert.ok(existsSync('netlify/functions/'+name+'.mjs'));});
test('Gemini models are cached, restored automatically, and working models are persisted',()=>{const html=readFileSync('index.html','utf8');assert.match(html,/remote_last_working_model/);assert.match(html,/remote_gemini_models_cache_v1/);assert.match(html,/refreshModels\(\)\.catch/);assert.match(html,/rememberWorkingModel\(model\)/);assert.match(html,/trying the next compatible model/i);});
test('Gemini model discovery is live and Facebook publishing is not enabled',()=>{const html=readFileSync('index.html','utf8');assert.match(html,/generativelanguage\.googleapis\.com\/v1beta\/models/);assert.match(html,/supportedGenerationMethods/);assert.match(html,/Facebook added later|does not publish to Facebook/i);assert.doesNotMatch(html,/graph\.facebook\.com\/.*\/photos/i);});
test('Photo search tries Openverse and Wikimedia without narrow aspect, size or licence filters',()=>{const news=readFileSync('netlify/functions/news.mjs','utf8'),images=readFileSync('netlify/functions/images.mjs','utf8');assert.match(news,/news\\.google\\.com\\/rss\\/search/);assert.match(news,/ceid=US:en/);assert.match(images,/api\\.openverse\\.org/);assert.match(images,/commons\\.wikimedia\\.org\\/w\\/api\\.php/);assert.match(images,/Promise\\.all\\(tasks\\)/);assert.doesNotMatch(images,/ALLOWED_LICENSES/);assert.doesNotMatch(images,/searchParams\\.set\\('aspect_ratio'/);assert.doesNotMatch(images,/searchParams\\.set\\('size'/);assert.doesNotMatch(images,/searchParams\\.set\\('category'/);assert.doesNotMatch(images,/searchParams\\.set\\('license_type'/);});
test('Square renderer has title and paragraph fields',()=>{const html=readFileSync('index.html','utf8');assert.match(html,/width="1080" height="1080"/);assert.match(html,/image_title/);assert.match(html,/image_paragraph/);assert.match(html,/Baloo 2/);});

test('Gemini model compatibility accepts models/ prefixed 3.8 and 3.5 IDs and rejects non-text endpoints',()=>{
 const html=readFileSync('index.html','utf8');
 const cleanMatch=html.match(/function cleanModelName\(name\)\s*\{[^}]*\}/);
 const textMatch=html.match(/function isText\(m\)\s*\{[^}]*\}/);
 assert.ok(cleanMatch,'cleanModelName helper should exist');
 assert.ok(textMatch,'isText compatibility filter should exist');
 const cleanModelName=new Function('return ('+cleanMatch[0]+');')();
 const isText=new Function('cleanModelName','return ('+textMatch[0]+');')(cleanModelName);
 assert.equal(isText({name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']}),true);
 assert.equal(isText({name:'models/gemini-3.5-flash',supportedGenerationMethods:['generateContent']}),true);
 assert.equal(isText({name:'models/gemma-4-31b-it',supportedGenerationMethods:['generateContent']}),true);
 assert.equal(isText({name:'models/gemini-3.8-flash-tts',supportedGenerationMethods:['generateContent']}),false);
 assert.equal(isText({name:'models/gemini-3.1-flash-image',supportedGenerationMethods:['generateContent']}),false);
 assert.equal(isText({name:'models/gemini-3.8-flash',supportedGenerationMethods:['countTokens']}),false);
});

test('Photo outages do not stop the news post renderer',()=>{
 const html=readFileSync('index.html','utf8');
 assert.ok(html.includes('photo search is best-effort'));
 assert.ok(html.includes('render(null,draft)'));
 assert.ok(html.includes('Fallback artwork'));
 assert.doesNotMatch(html,/No landscape image was found from Openverse/);
});
