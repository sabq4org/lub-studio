// Editorial cycle: sources and claims, platform outputs, review checklist, versions bound to approval, comments.
import assert from 'node:assert/strict';
import {startWorker,client,ok,status,tokenFrom,SETUP_TOKEN} from './test-harness.mjs';

const {mf}=await startWorker('editorial');
try{
 const owner=client(mf);await ok(owner.auth({action:'setup',setupToken:SETUP_TOKEN,name:'المالك',email:'owner@lub.test',password:'owner-password-123'}));
 const join=async(role,email)=>{const inv=await ok(owner.team({action:'invite',email,role}));const c=client(mf);const r=await ok(c.auth({action:'acceptInvite',token:tokenFrom(inv.link),name:role,password:'member-password-123'}));return Object.assign(c,{id:r.user.id});};
 const reviewer=await join('reviewer','r@lub.test'),viewer=await join('viewer','v@lub.test'),publisher=await join('publisher','p@lub.test'),editor=await join('editor','e@lub.test');
 const ws=await ok(owner.ws());let s=ws.stories.find(x=>x.topic==='السعودية بالأرقام');
 const save=async(data,c=owner,label='save')=>{const r=await ok(c.ws({action:'saveStory',id:s.id,version:s.version,data:{...s,...data}}),label);s=r.workspace.stories.find(x=>x.id===s.id);return r;};
 const move=async(target,c=owner,extra={},label=target)=>{const r=await ok(c.ws({action:'transition',id:s.id,version:s.version,target,...extra}),label);s=r.workspace.stories.find(x=>x.id===s.id);return r;};
 const refuse=async(code,body,c=owner,label)=>status(c.ws({id:s.id,version:s.version,...body}),code,label);
 await save({reviewer:reviewer.id,audience:'الأسر في المدن السعودية'});assert.equal(s.audience,'الأسر في المدن السعودية');
 await move('research');await move('production');

 // Sources and claims.
 const media={id:'m1',url:'https://news.example/item',publisher:'صحيفة',title:'تقرير',publishedAt:'2026-09-20',accessedAt:'2026-09-29',kind:'media'};
 const base={script:'نص للاختبار فقط',sourceVerified:true,rightsVerified:true,assetUrl:'https://example.com/asset'};
 await refuse(400,{action:'saveStory',data:{...s,...base,sources:[media],claims:[{id:'c1',text:'رقم',figure:'5%',kind:'fact',sourceIds:['nope'],verified:true}]}},owner,'claim pointing to unknown source');
 await refuse(400,{action:'saveStory',data:{...s,sources:[media,media]}},owner,'duplicate source ids');
 await refuse(400,{action:'saveStory',data:{...s,sources:[{...media,url:'javascript:alert(1)'}]}},owner,'unsafe source url');
 await save({...base,sources:[media],claims:[{id:'c1',text:'نسبة التغير السنوي',figure:'5%',kind:'fact',sourceIds:[],verified:false},{id:'c2',text:'قراءتنا للسبب',figure:'',kind:'inference',sourceIds:[],verified:false}],outputs:[{id:'o1',platform:'x',format:'thread',parts:['أ'.repeat(281),'الجزء الثاني'],assetUrl:''}]});
 const blocked=await refuse(400,{action:'transition',target:'review'},owner,'blockers');
 for(const m of ['مصدر سعودي رسمي','ربط كل رقم أو ادعاء بمصدره','التحقق من الحقائق المؤكدة','تقصير نصوص X'])assert.ok(blocked.error.includes(m),m+' in '+blocked.error);
 assert.ok(!blocked.error.includes('إضافة مصدر برابطه'),'a complete source satisfies the basic rule');
 const official={id:'g1',url:'https://stats.gov.sa/x',publisher:'الهيئة العامة للإحصاء',title:'نشرة',publishedAt:'2026-09-01',accessedAt:'2026-09-29',kind:'official_sa'};
 await save({sources:[media,official],claims:[{id:'c1',text:'نسبة التغير السنوي',figure:'5%',kind:'fact',sourceIds:['g1'],verified:true},{id:'c2',text:'قراءتنا للسبب',figure:'',kind:'inference',sourceIds:[],verified:false}],outputs:[{id:'o1',platform:'x',format:'thread',parts:['الجزء الأول','الجزء الثاني'],assetUrl:''}]});
 assert.ok(s.contentVersion>=3,'every content save is a new version');
 await move('review');

 // Checklist: only the reviewer/managers, only in review; approval needs all items.
 await refuse(403,{action:'setChecklist',checklist:{sources:true}},viewer,'viewer cannot tick');
 await refuse(403,{action:'setChecklist',checklist:{sources:true}},publisher,'publisher cannot tick');
 await refuse(400,{action:'setChecklist',checklist:{made_up:true}},reviewer,'unknown item');
 let r=await ok(reviewer.ws({action:'setChecklist',id:s.id,version:s.version,checklist:{sources:true,figures:true}}));s=r.workspace.stories.find(x=>x.id===s.id);
 const partial=await refuse(400,{action:'transition',target:'approved'},owner,'partial checklist');assert.match(partial.error,/قائمة تحقق المراجعة \(5 بنود\)/);
 // Return needs a reason, which becomes a review note.
 await refuse(400,{action:'transition',target:'production',note:'قصير'},reviewer,'short reason');
 await move('production',reviewer,{note:'الرقم في الجزء الثاني يحتاج مصدرًا'});
 await save({script:'نص معدل بعد الملاحظة'});assert.deepEqual(s.checklist,{},'content change resets the checklist');
 await move('review');
 const all={sources:true,figures:true,labels:true,quotes:true,rights:true,language:true,platform:true};
 r=await ok(reviewer.ws({action:'setChecklist',id:s.id,version:s.version,checklist:all}));s=r.workspace.stories.find(x=>x.id===s.id);assert.equal(s.checklistBy,reviewer.id);
 await move('approved');const approvedVersion=s.contentVersion;assert.equal(s.approvedContentVersion,approvedVersion);assert.ok(s.approvedHash);
 await refuse(403,{action:'setChecklist',checklist:{}},reviewer,'checklist locked outside review');

 // Scheduled story edited: schedule dropped, approval revoked, a new version exists.
 await save({plannedAt:'2026-10-15T19:30'},publisher,'publisher schedules');await move('planned',publisher);
 await save({outputs:[{id:'o1',platform:'x',format:'thread',parts:['الجزء الأول معدل','الجزء الثاني'],assetUrl:''}]},owner,'edit scheduled content');
 assert.equal(s.status,'production');assert.equal(s.plannedAt,'');assert.equal(s.approvedHash,'');assert.equal(s.contentVersion,approvedVersion+1);
 assert.match(s.history[0].message,/مادة مجدولة/);

 // Versions and comments.
 const detail=await ok(owner.request('/api/story?id='+s.id));
 assert.equal(detail.versions[0].n,s.contentVersion);assert.ok(detail.versions.every((v,i,a)=>i===0||a[i-1].n>v.n));
 assert.ok(detail.versions.find(v=>v.n===approvedVersion).content.outputs[0].parts[0]==='الجزء الأول','approved snapshot keeps the approved text');
 assert.equal(detail.versions.filter(v=>v.approved).length,0,'no version is approved after the edit');
 const note=detail.comments.find(c=>c.kind==='review_note');assert.equal(note.body,'الرقم في الجزء الثاني يحتاج مصدرًا');assert.equal(note.authorId,reviewer.id);
 await status(viewer.request('/api/story',{action:'comment',storyId:s.id,body:'تعليق'}),403,'viewer cannot comment');
 await status(reviewer.request('/api/story',{action:'comment',storyId:s.id,body:'قرار',kind:'decision'}),403,'only managers log decisions');
 const c=await ok(editor.request('/api/story',{action:'comment',storyId:s.id,body:'أضفت المصدر'}));
 await ok(owner.request('/api/story',{action:'comment',storyId:s.id,body:'نعتمد الزاوية الاقتصادية',kind:'decision'}));
 await status(publisher.request('/api/story',{action:'resolve',id:c.id}),403,'others cannot resolve');
 await ok(reviewer.request('/api/story',{action:'resolve',id:c.id}));
 const after=await ok(viewer.request('/api/story?id='+s.id));assert.ok(after.comments.find(x=>x.id===c.id).resolvedAt);assert.ok(after.comments.some(x=>x.kind==='decision'));
 await status(owner.request('/api/story?id=missing'),404,'unknown story');
 await status(client(mf).request('/api/story?id='+s.id),401,'anonymous');

 // Re-approval binds to the new version; the content hash guards planning.
 await move('review');r=await ok(reviewer.ws({action:'setChecklist',id:s.id,version:s.version,checklist:all}));s=r.workspace.stories.find(x=>x.id===s.id);
 await move('approved');const again=await ok(owner.request('/api/story?id='+s.id));assert.equal(again.versions.find(v=>v.approved).n,s.contentVersion);
 console.log('PASS: multi-source documentation, Saudi official source rule, claims linked to sources, fact verification, X length, platform outputs, review checklist permissions, return reasons, versions per content change, approval bound to a content version, scheduled edits revoke approval, comments and decisions');
}finally{await mf.dispose();}
