import {createRequire} from 'node:module';
import {readFileSync, mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const rootRequire=createRequire(import.meta.url);
const wranglerRequire=createRequire(rootRequire.resolve('wrangler/package.json'));
const {Miniflare}=wranglerRequire('miniflare');
const {build}=wranglerRequire('esbuild');
mkdirSync('.sites-runtime',{recursive:true});
await build({stdin:{contents:`import {GET,POST} from './app/api/workspace/route'; export default {async fetch(req,env){globalThis.__testEnv=env;return req.method==='GET'?GET():POST(req)}}`,resolveDir:process.cwd(),sourcefile:'test-worker.ts'},bundle:true,format:'esm',platform:'browser',outfile:'.sites-runtime/test-worker.js',plugins:[{name:'test-binding',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'binding'}));b.onLoad({filter:/.*/,namespace:'binding'},()=>({contents:'export const env=new Proxy({}, {get:(_,p)=>globalThis.__testEnv[p]});',loader:'js'}));}}]});
const mf=new Miniflare({modules:true,scriptPath:'.sites-runtime/test-worker.js',compatibilityDate:'2026-05-01',d1Databases:{DB:'lub-test'}});
try{
 const db=await mf.getD1Database('DB');const sql=readFileSync('drizzle/0000_silky_wraith.sql','utf8');for(const statement of sql.split('--> statement-breakpoint'))await db.prepare(statement.trim()).run();
 async function call(body){const r=await mf.dispatchFetch('https://test.local/api/workspace',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});return {status:r.status,...await r.json()};}
 let d=await call();assert.equal(d.stories.length,6);assert.equal(d.tasks.length,12);assert.equal((await call()).stories.length,6);
 let s=d.stories[0];const changed=async payload=>{const r=await call(payload);assert.equal(r.status,200,JSON.stringify(r));s=r.workspace.stories.find(x=>x.id===s.id);return r;};
 const transition=async target=>changed({action:'transition',id:s.id,version:s.version,target});
 await transition('research');await transition('production');assert.equal((await call({action:'transition',id:s.id,version:s.version,target:'approved'})).status,400);
 assert.equal((await call({action:'transition',id:s.id,version:s.version,target:'review'})).status,400);
 await changed({action:'saveStory',id:s.id,version:s.version,data:{...s,script:'نص تجريبي للاختبار فقط',sourceUrl:'https://example.com/source',sourceVerified:true,rightsVerified:true,assetUrl:'https://example.com/asset'}});
 await transition('review');await transition('approved');
 const oldVersion=s.version;
 await changed({action:'saveStory',id:s.id,version:s.version,data:{...s,script:'نص معدل يحتاج إعادة اعتماد'}});assert.equal(s.status,'production');
 assert.equal((await call({action:'saveStory',id:s.id,version:oldVersion,data:s})).status,409);
 assert.equal((await call({action:'transition',id:s.id,version:s.version,target:'published',postUrl:'https://example.com'})).status,400);
 assert.equal((await call()).stories.find(x=>x.id===s.id).script,'نص معدل يحتاج إعادة اعتماد');
 const m=await call({action:'createMember',data:{name:'عضو اختبار',role:'باحث'}});assert.equal(m.status,200);assert.equal((await call()).members.length,1);
 const task=d.tasks[0];const tr=await call({action:'saveTask',id:task.id,version:task.version,data:{...task,done:true,owner:m.id}});assert.equal(tr.status,200);assert.equal((await call()).tasks.find(t=>t.id===task.id).done,true);
 console.log('PASS: initialization, persistence, legal transitions, review blockers, approval invalidation, version conflict, manual publish protection, member and task persistence');
} finally {await mf.dispose();}
