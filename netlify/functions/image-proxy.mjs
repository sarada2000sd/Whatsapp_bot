import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
const CORS = { 'Access-Control-Allow-Origin':'*', 'Access-Control-Allow-Headers':'Content-Type', 'Access-Control-Allow-Methods':'GET, OPTIONS' };
function json(status,error){return new Response(JSON.stringify({error}),{status,headers:{...CORS,'Content-Type':'application/json; charset=utf-8'}});}
function isPrivate(ip) {
 if(isIP(ip)===4){const p=ip.split('.').map(Number);return p[0]===0||p[0]===10||p[0]===127||p[0]>=224||(p[0]===169&&p[1]===254)||(p[0]===172&&p[1]>=16&&p[1]<=31)||(p[0]===192&&p[1]===168)||(p[0]===100&&p[1]>=64&&p[1]<=127);}
 if(isIP(ip)===6)return ip==='::1'||ip.startsWith('fc')||ip.startsWith('fd')||ip.startsWith('fe80:')||ip.startsWith('::ffff:127.');
 return true;
}
async function validate(raw){const url=new URL(raw);if(url.protocol!=='https:'||url.username||url.password)throw new Error('Only public HTTPS image URLs are allowed.');const host=url.hostname.toLowerCase();if(!host||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local'))throw new Error('Private host blocked.');if(isIP(host)){if(isPrivate(host))throw new Error('Private IP blocked.');}else{const ips=await lookup(host,{all:true,verbatim:true});if(!ips.length||ips.some(x=>isPrivate(x.address)))throw new Error('Private IP resolution blocked.');}return url;}
export default async(request)=>{
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 if(request.method!=='GET')return json(405,'Method not allowed.');
 const raw=new URL(request.url).searchParams.get('url');if(!raw)return json(400,'Image URL is required.');
 let target;try{target=await validate(raw);}catch(e){return json(400,e.message);}
 try{let res,hops=0;while(hops<=3){res=await fetch(target.href,{redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (compatible; REMOTE-NewsPreview/1.0)','Accept':'image/avif,image/webp,image/png,image/jpeg,*/*;q=0.5'},signal:AbortSignal.timeout(10000)});if([301,302,303,307,308].includes(res.status)){const loc=res.headers.get('location');if(!loc)break;target=await validate(new URL(loc,target.href).href);hops++;continue;}break;}if(!res||!res.ok)return json(502,'Image source returned HTTP '+(res?res.status:'unknown')+'.');const type=(res.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();if(!['image/jpeg','image/png','image/webp','image/avif','image/gif'].includes(type))return json(415,'Source is not a supported raster image.');const length=Number(res.headers.get('content-length')||0);if(length>8*1024*1024)return json(413,'Image exceeds the 8 MB proxy limit.');const bytes=await res.arrayBuffer();if(bytes.byteLength>8*1024*1024)return json(413,'Image exceeds the 8 MB proxy limit.');return new Response(bytes,{status:200,headers:{...CORS,'Content-Type':type,'Cache-Control':'public, max-age=86400','X-Content-Type-Options':'nosniff'}});}catch(e){return json(502,'Image proxy failed: '+String(e.message||e));}
};
