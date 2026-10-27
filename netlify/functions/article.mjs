import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
const headers = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Allow-Methods':'GET, OPTIONS', 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' };
function response(status, body) { return new Response(JSON.stringify(body), { status, headers }); }
function privateIp(ip) {
  if (isIP(ip) === 4) {
    const p=ip.split('.').map(Number);
    return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127);
  }
  if (isIP(ip) === 6) return ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:')||ip.startsWith('::ffff:127.');
  return true;
}
async function assertPublicUrl(raw) {
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password)throw new Error('Only public HTTPS URLs are allowed.');
  const host=url.hostname.toLowerCase();
  if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local'))throw new Error('Private host rejected.');
  if(isIP(host)){if(privateIp(host))throw new Error('Private IP rejected.');}
  else{const addresses=await lookup(host,{all:true,verbatim:true});if(!addresses.length||addresses.some(a=>privateIp(a.address)))throw new Error('Host resolves to a private or unsafe address.');}
  return url;
}
function decode(html='') {
 return String(html).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g,'$1').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/\s+/g,' ').trim();
}
function extract(html) {
 const t=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i),title=t?decode(t[1]).slice(0,300):'';
 const m=html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]+content=["']([^"']+)["'][^>]*>/i)||html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["'](?:description|og:description|twitter:description)["'][^>]*>/i);
 const description=m?decode(m[1]).slice(0,1200):'';
 const match=html.match(/<(?:article|main)\b[^>]*>([\s\S]*?)<\/(?:article|main)>/i),main=match?match[1]:html;
 const paragraphs=[...main.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(x=>decode(x[1])).filter(x=>x.length>45&&x.length<1400);
 return {title,description,text:[...new Set(paragraphs)].slice(0,45).join('\n\n').slice(0,16000)||description};
}
export default async(request) => {
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method!=='GET')return response(405,{error:'Method not allowed.'});
 const raw=new URL(request.url).searchParams.get('url');
 if(!raw)return response(400,{error:'URL is required.'});
 try {
  let finalUrl=(await assertPublicUrl(raw)).href,res,hops=0;
  while(hops<=4){res=await fetch(finalUrl,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (compatible; REMOTE-NewsPreview/1.0)','Accept':'text/html,application/xhtml+xml'},signal:AbortSignal.timeout(9000)});if([301,302,303,307,308].includes(res.status)){const loc=res.headers.get('location');if(!loc)break;finalUrl=new URL(loc,finalUrl).href;await assertPublicUrl(finalUrl);hops++;continue;}break;}
  if(!res||!res.ok)return response(502,{error:'Source returned HTTP '+(res?res.status:'unknown')});
  if(!/text\/html|application\/xhtml\+xml/i.test(res.headers.get('content-type')||''))return response(415,{error:'Source is not an HTML article page.'});
  const content=extract((await res.text()).slice(0,2000000));
  return response(200,{finalUrl,title:content.title,description:content.description,text:content.text,status:content.text.length>500?'article-text':'metadata-only',characterCount:content.text.length});
 }catch(e){return response(400,{error:'Could not read source: '+String(e.message||e)});}
};
