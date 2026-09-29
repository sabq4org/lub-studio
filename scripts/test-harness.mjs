// Shared harness: bundles the API routes into one Worker and runs it on an isolated Miniflare D1.
import {createRequire} from 'node:module';
import {readFileSync, readdirSync, mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const rootRequire=createRequire(import.meta.url);
const wranglerRequire=createRequire(rootRequire.resolve('wrangler/package.json'));
const {Miniflare}=wranglerRequire('miniflare');
const {build}=wranglerRequire('esbuild');
const routes={'/api/workspace':'./app/api/workspace/route','/api/auth':'./app/api/auth/route','/api/team':'./app/api/team/route','/api/activity':'./app/api/activity/route','/api/story':'./app/api/story/route'};

export const SETUP_TOKEN='test-setup-token-not-a-secret';
export async function startWorker(name,bindings={}){
 mkdirSync('.sites-runtime',{recursive:true});
 const imports=Object.values(routes).map((p,i)=>`import * as r${i} from '${p}';`).join('\n');
 const table=Object.keys(routes).map((p,i)=>`'${p}':r${i}`).join(',');
 const outfile=`.sites-runtime/test-worker-${name}.js`;
 await build({stdin:{contents:`${imports}\nconst routes={${table}};export default {async fetch(req,env){globalThis.__testEnv=env;const r=routes[new URL(req.url).pathname];if(!r)return new Response('not found',{status:404});return req.method==='GET'?r.GET(req):r.POST(req)}}`,resolveDir:process.cwd(),sourcefile:'test-worker.ts'},bundle:true,format:'esm',platform:'browser',outfile,logLevel:'error',plugins:[{name:'test-binding',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'binding'}));b.onLoad({filter:/.*/,namespace:'binding'},()=>({contents:'export const env=new Proxy({}, {get:(_,p)=>globalThis.__testEnv[p]});',loader:'js'}));}}]});
 const mf=new Miniflare({modules:true,scriptPath:outfile,compatibilityDate:'2026-05-01',d1Databases:{DB:'lub-test-'+name},bindings:{LUB_SETUP_TOKEN:SETUP_TOKEN,...bindings}});
 const db=await mf.getD1Database('DB');
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const statement of readFileSync('drizzle/'+file,'utf8').split('--> statement-breakpoint'))if(statement.trim())await db.prepare(statement.trim()).run();
 return {mf,db};
}

// A browser-like client with its own cookie jar.
export function client(mf,extraHeaders={}){
 let cookie='';
 async function request(path,body,headers={}){
  const init=body?{method:'POST',headers:{'Content-Type':'application/json',...extraHeaders,...headers},body:JSON.stringify(body)}:{headers:{...extraHeaders,...headers}};
  if(cookie)init.headers.cookie=cookie;
  const r=await mf.dispatchFetch('https://test.local'+path,init);
  const set=r.headers.get('set-cookie');if(set){const v=set.split(';')[0];cookie=v.endsWith('=')?'':v;}
  const text=await r.text();let data;try{data=JSON.parse(text);}catch{data={raw:text};}
  return {status:r.status,setCookie:set,...data};
 }
 return {request,get cookie(){return cookie;},set cookie(v){cookie=v;},
  auth:body=>request('/api/auth',body),
  team:body=>request('/api/team',body),
  ws:body=>request('/api/workspace',body),
  activity:q=>request('/api/activity'+(q||''))};
}

export async function ok(promise,label){const r=await promise;assert.equal(r.status,200,(label||'request')+': '+JSON.stringify(r));return r;}
export async function status(promise,code,label){const r=await promise;assert.equal(r.status,code,(label||'request')+': '+JSON.stringify(r));return r;}
export const tokenFrom=link=>link.split('=').slice(1).join('=');
