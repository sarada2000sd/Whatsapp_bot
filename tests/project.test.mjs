import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
test('Netlify app and backend endpoints exist',()=>{assert.ok(existsSync('index.html'));for(const name of ['news','images','article','image-proxy'])assert.ok(existsSync('netlify/functions/'+name+'.mjs'));});
test('Gemini model list is discovered live and Facebook publishing is not enabled',()=>{const html=readFileSync('index.html','utf8');assert.match(html,/generativelanguage\.googleapis\.com\/v1beta\/models/);assert.match(html,/supportedGenerationMethods/);assert.match(html,/Facebook added later|does not publish to Facebook/i);assert.doesNotMatch(html,/graph\.facebook\.com\/.*\/photos/i);});
test('News discovery uses US RSS and image search filters for commercial licences',()=>{const news=readFileSync('netlify/functions/news.mjs','utf8'),images=readFileSync('netlify/functions/images.mjs','utf8');assert.match(news,/news\.google\.com\/rss\/search/);assert.match(news,/ceid=US:en/);assert.match(images,/license_type/);assert.match(images,/aspect_ratio/);assert.match(images,/commercial/);});
test('Square renderer has title and paragraph fields',()=>{const html=readFileSync('index.html','utf8');assert.match(html,/width="1080" height="1080"/);assert.match(html,/image_title/);assert.match(html,/image_paragraph/);assert.match(html,/Baloo 2/);});
