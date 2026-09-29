import assert from 'node:assert/strict';
import {startWorker,client,ok,SETUP_TOKEN} from './test-harness.mjs';
const {mf}=await startWorker('lub');
try{
 const owner=client(mf);
 await ok(owner.auth({action:'setup',setupToken:SETUP_TOKEN,name:'مالك الاختبار',email:'owner@lub.test',password:'owner-password-123'}),'setup');
 const call=body=>owner.ws(body);
 let d=await call();assert.equal(d.stories.length,6);assert.equal(d.tasks.length,12);assert.equal((await call()).stories.length,6);
 let s=d.stories[0];const changed=async payload=>{const r=await call(payload);assert.equal(r.status,200,JSON.stringify(r));s=r.workspace.stories.find(x=>x.id===s.id);return r;};
 const transition=async target=>changed({action:'transition',id:s.id,version:s.version,target});
 await transition('research');await transition('production');assert.equal((await call({action:'transition',id:s.id,version:s.version,target:'approved'})).status,400);
 assert.equal((await call({action:'transition',id:s.id,version:s.version,target:'review'})).status,400);
 await changed({action:'saveStory',id:s.id,version:s.version,data:{...s,script:'نص تجريبي للاختبار فقط',sourceUrl:'https://example.com/source',sourceVerified:true,rightsVerified:true,assetUrl:'https://example.com/asset'}});
 await transition('review');await transition('approved');assert.ok(s.approvedBy&&s.approvedAt,'approval records who approved');
 const oldVersion=s.version;
 await changed({action:'saveStory',id:s.id,version:s.version,data:{...s,script:'نص معدل يحتاج إعادة اعتماد'}});assert.equal(s.status,'production');assert.equal(s.approvedBy,'');
 assert.equal((await call({action:'saveStory',id:s.id,version:oldVersion,data:s})).status,409);
 assert.equal((await call({action:'transition',id:s.id,version:s.version,target:'published',postUrl:'https://example.com'})).status,400);
 assert.equal((await call()).stories.find(x=>x.id===s.id).script,'نص معدل يحتاج إعادة اعتماد');
 assert.ok(s.history.every(h=>h.by==='مالك الاختبار'||h.message==='أُضيفت فكرة تأسيسية مقترحة'),'history entries carry the actor');
 const m=await call({action:'createMember',data:{name:'عضو اختبار',role:'باحث'}});assert.equal(m.status,200);assert.equal((await call()).members.length,1);
 const task=d.tasks[0];const tr=await call({action:'saveTask',id:task.id,version:task.version,data:{...task,done:true,owner:m.id}});assert.equal(tr.status,200);assert.equal((await call()).tasks.find(t=>t.id===task.id).done,true);
 console.log('PASS: initialization, persistence, legal transitions, review blockers, approval invalidation, version conflict, manual publish protection, member and task persistence');
} finally {await mf.dispose();}
