// Accounts, invitations, server-side permissions and the activity log.
import assert from 'node:assert/strict';
import {startWorker,client,ok,status,tokenFrom,SETUP_TOKEN} from './test-harness.mjs';

const ready={script:'نص للاختبار فقط',sourceUrl:'https://example.com/source',sourceVerified:true,rightsVerified:true,assetUrl:'https://example.com/asset'};
const {mf,db}=await startWorker('access');
try{
 // Anonymous requests and forged identity headers get nothing.
 const anon=client(mf);
 await status(anon.ws(),401,'anonymous read');await status(anon.ws({action:'createStory',data:{}}),401,'anonymous write');
 await status(anon.team(),401,'anonymous team');await status(anon.activity(),401,'anonymous activity');
 const forged=client(mf,{'oai-authenticated-user-id':'u1','oai-authenticated-user-email':'owner@lub.test'});
 await status(forged.ws(),401,'forged Sites headers are ignored outside sites mode');
 let st=await ok(anon.request('/api/auth'));assert.equal(st.setupRequired,true);assert.equal(st.mode,'local');assert.equal(st.user,null);
 await status(anon.request('/api/workspace',{action:'createStory',data:{}},{origin:'https://evil.example'}),403,'foreign origin');

 // Owner setup requires the server secret, and only works once.
 await status(anon.auth({action:'setup',setupToken:'wrong',name:'مالك',email:'owner@lub.test',password:'owner-password-123'}),403,'wrong setup token');
 await status(anon.auth({action:'setup',setupToken:SETUP_TOKEN,name:'مالك',email:'owner@lub.test',password:'short'}),400,'weak password');
 const owner=client(mf);
 const setup=await ok(owner.auth({action:'setup',setupToken:SETUP_TOKEN,name:'المالك',email:'Owner@Lub.test',password:'owner-password-123'}),'setup');
 assert.match(setup.setCookie,/HttpOnly/);assert.match(setup.setCookie,/SameSite=Lax/);assert.match(setup.setCookie,/Secure/);
 await status(anon.auth({action:'setup',setupToken:SETUP_TOKEN,name:'آخر',email:'x@lub.test',password:'owner-password-123'}),409,'second setup');
 const stored=await db.prepare('SELECT password_hash FROM lub_users').first();assert.match(stored.password_hash,/^pbkdf2\$100000\$/);assert.ok(!stored.password_hash.includes('owner-password-123'));
 const sessions=await db.prepare('SELECT id FROM lub_sessions').all();assert.ok(sessions.results.every(r=>!setup.setCookie.includes(r.id)),'only token hashes are stored');

 // Login, wrong password, and throttling.
 const again=client(mf);
 await status(again.auth({action:'login',email:'owner@lub.test',password:'nope-nope-nope'}),401,'wrong password');
 await ok(again.auth({action:'login',email:'OWNER@lub.test',password:'owner-password-123'}),'login is case-insensitive on e-mail');
 await ok(again.auth({action:'logout'}));await status(again.ws(),401,'logged out');
 const brute=client(mf);for(let i=0;i<8;i++)await status(brute.auth({action:'login',email:'owner@lub.test',password:'guess-'+i+'-xxxxx'}),401,'guess');
 await status(brute.auth({action:'login',email:'owner@lub.test',password:'owner-password-123'}),429,'locked after repeated failures');
 await db.prepare('DELETE FROM lub_login_attempts').run();

 // Invitations: one per role, single use, expiry and revocation.
 const ws0=await ok(owner.ws());
 const legacy=await ok(owner.ws({action:'createMember',data:{name:'عضو قديم',role:'منتج'}}));
 const legacyStory=ws0.stories[1];await ok(owner.ws({action:'saveStory',id:legacyStory.id,version:legacyStory.version,data:{...legacyStory,producer:legacy.id}}));
 const people={};
 for(const [role,email,memberId] of [['managing_editor','manager@lub.test'],['editor','editor@lub.test'],['producer','producer@lub.test',legacy.id],['reviewer','reviewer@lub.test'],['publisher','publisher@lub.test'],['viewer','viewer@lub.test']]){
  const inv=await ok(owner.team({action:'invite',email,role,name:'',memberId}),'invite '+role);assert.match(inv.link,/^https:\/\/test\.local\/#invite=/);
  const c=client(mf);const info=await ok(c.auth({action:'inspectToken',kind:'invite',token:tokenFrom(inv.link)}));assert.equal(info.role,role);
  const acc=await ok(c.auth({action:'acceptInvite',token:tokenFrom(inv.link),name:'عضو '+role,password:'member-password-123'}),'accept '+role);
  await status(client(mf).auth({action:'acceptInvite',token:tokenFrom(inv.link),name:'مكرر',password:'member-password-123'}),410,'invite is single use');
  people[role]=Object.assign(c,{id:acc.user.id});
 }
 assert.equal(people.producer.id,legacy.id,'invite linked to a legacy member keeps its id and assignments');
 await status(owner.team({action:'invite',email:'editor@lub.test',role:'viewer'}),409,'existing e-mail');
 const expired=await ok(owner.team({action:'invite',email:'late@lub.test',role:'viewer'}));
 await db.prepare("UPDATE lub_tokens SET expires_at='2000-01-01T00:00:00.000Z' WHERE email='late@lub.test'").run();
 await status(client(mf).auth({action:'acceptInvite',token:tokenFrom(expired.link),name:'متأخر',password:'member-password-123'}),410,'expired invite');
 const revoked=await ok(owner.team({action:'invite',email:'gone@lub.test',role:'viewer'}));
 const pending=(await ok(owner.team())).invites.find(i=>i.email==='gone@lub.test');await ok(owner.team({action:'revokeInvite',id:pending.id}));
 await status(client(mf).auth({action:'acceptInvite',token:tokenFrom(revoked.link),name:'ملغى',password:'member-password-123'}),410,'revoked invite');
 for(const r of ['managing_editor','editor','viewer','publisher'])await status(people[r].team({action:'invite',email:'z@lub.test',role:'owner'}),403,r+' cannot invite');
 const viewerTeam=await ok(people.viewer.team());assert.equal(viewerTeam.users[0].email,undefined,'e-mails hidden from non-managers');assert.equal(viewerTeam.invites.length,0);

 // Viewer: read only.
 const {viewer,editor,producer,reviewer,publisher,managing_editor:manager}=people;
 await ok(viewer.ws(),'viewer reads');await status(viewer.ws({action:'createStory',data:{title:'قصة مشاهد',series:'لُب يشرح',topic:'اقتصاد الحياة',format:'فيديو قصير',owner:'',priority:'عادية',due:'',plannedAt:'',angle:'',script:'',sourceUrl:'',sourceNote:'',sourceVerified:false,rightsVerified:false,assetUrl:''}}),403,'viewer cannot write');

 // Editor: creates ideas assigned to self, edits only assigned content.
 const base={series:'لُب يشرح',topic:'اقتصاد الحياة',format:'فيديو قصير',owner:manager.id,priority:'عالية',due:'2026-10-10',plannedAt:'',angle:'',script:'',sourceUrl:'',sourceNote:'',sourceVerified:false,rightsVerified:false,assetUrl:''};
 const created=await ok(editor.ws({action:'createStory',data:{...base,title:'قصة المحرر'}}));
 let story=created.workspace.stories.find(s=>s.id===created.id);
 assert.equal(story.owner,editor.id);assert.equal(story.researcher,editor.id);assert.equal(story.priority,'عادية');assert.equal(story.due,'','non-managers cannot set deadlines or assignments');
 const seed=created.workspace.stories.find(s=>s.id==='idea-2');
 await status(editor.ws({action:'saveStory',id:seed.id,version:seed.version,data:{...seed,script:'تعديل غير مسند'}}),403,'editor cannot edit unassigned story');
 await status(editor.ws({action:'transition',id:seed.id,version:seed.version,target:'research'}),403,'editor cannot move unassigned story');
 await status(editor.ws({action:'saveStory',id:story.id,version:story.version,data:{...story,reviewer:reviewer.id}}),403,'editor cannot assign');
 const save=async(c,data,label)=>{const r=await ok(c.ws({action:'saveStory',id:story.id,version:story.version,data:{...story,...data}}),label);story=r.workspace.stories.find(s=>s.id===story.id);return r;};
 const move=async(c,target,label,extra={})=>{const r=await ok(c.ws({action:'transition',id:story.id,version:story.version,target,...extra}),label);story=r.workspace.stories.find(s=>s.id===story.id);return r;};
 await save(editor,{script:ready.script,sourceUrl:ready.sourceUrl,sourceVerified:true},'editor edits own content');
 await status(editor.ws({action:'saveStory',id:story.id,version:story.version,data:{...story,assetUrl:ready.assetUrl}}),403,'editor cannot set assets');
 await move(editor,'research','editor starts research');await move(editor,'production','editor starts production');

 // Manager assigns the production team.
 await save(manager,{producer:producer.id,reviewer:reviewer.id},'manager assigns');
 await status(manager.ws({action:'saveStory',id:story.id,version:story.version,data:{...story,producer:'no-such-user'}}),400,'unknown assignee');
 await status(producer.ws({action:'saveStory',id:story.id,version:story.version,data:{...story,script:'تعديل المنتج'}}),403,'producer cannot edit script');
 await save(producer,{assetUrl:ready.assetUrl,rightsVerified:true},'producer sets assets');
 await move(producer,'review','producer sends to review');

 // Review: reviewer returns, only managers approve.
 await status(reviewer.ws({action:'transition',id:story.id,version:story.version,target:'approved'}),403,'reviewer cannot approve');
 await status(editor.ws({action:'transition',id:story.id,version:story.version,target:'approved'}),403,'editor cannot approve');
 await move(reviewer,'production','reviewer returns');await move(producer,'review','resubmit');
 await move(manager,'approved','manager approves');assert.equal(story.approvedBy,manager.id);

 // Publishing: publisher plans and records; manager cannot publish.
 await status(editor.ws({action:'saveStory',id:story.id,version:story.version,data:{...story,plannedAt:'2026-10-12T20:00'}}),403,'editor cannot schedule');
 await save(publisher,{plannedAt:'2026-10-12T20:00'},'publisher sets time');assert.equal(story.status,'approved','schedule edits keep approval');
 await move(publisher,'planned','publisher plans');
 await status(manager.ws({action:'transition',id:story.id,version:story.version,target:'published',postUrl:'https://x.com/lub/status/123'}),403,'manager cannot publish');
 await move(publisher,'published','publisher records post',{postUrl:'https://x.com/lub/status/123'});assert.equal(story.publishedBy,publisher.id);
 assert.deepEqual(story.history.slice(0,4).map(h=>h.byId),[publisher.id,publisher.id,publisher.id,manager.id],'history names who did what');

 // Tasks: members may only tick their own tasks.
 const tasks=(await ok(owner.ws())).tasks;let task=tasks[0];
 const assigned=await ok(manager.ws({action:'saveTask',id:task.id,version:task.version,data:{...task,owner:editor.id}}));task=assigned.workspace.tasks.find(t=>t.id===task.id);
 await status(editor.ws({action:'saveTask',id:task.id,version:task.version,data:{...task,title:'عنوان جديد للمهمة'}}),403,'editor cannot rename task');
 await ok(editor.ws({action:'saveTask',id:task.id,version:task.version,data:{...task,done:true}}),'editor ticks own task');
 const other=tasks[1];await status(editor.ws({action:'saveTask',id:other.id,version:other.version,data:{...other,done:true}}),403,'editor cannot tick others');
 await status(editor.ws({action:'createMember',data:{name:'عضو',role:'دور'}}),403,'editor cannot add members');

 // Activity log: every action names its actor; full log is for managers.
 const log=await ok(manager.activity());
 const approvals=log.entries.filter(e=>e.action==='story.transition'&&e.details?.to==='approved');assert.equal(approvals[0].actorId,manager.id);
 assert.ok(log.entries.some(e=>e.action==='story.transition'&&e.details?.to==='published'&&e.actorName==='عضو publisher'));
 assert.ok(log.entries.some(e=>e.action==='team.invite'&&e.actorId));assert.ok(log.entries.some(e=>e.action==='auth.login'));
 assert.ok(!JSON.stringify(log).includes('member-password-123')&&!JSON.stringify(log).includes('#invite='),'no secrets in the log');
 await status(editor.activity(),403,'editor cannot read full log');
 const storyLog=await ok(editor.activity('?entity='+story.id));assert.ok(storyLog.entries.length>=8);

 // Account management: roles, disable, last-owner guard, recovery links.
 const team=async()=>(await ok(owner.team())).users;
 const find=async id=>(await team()).find(u=>u.id===id);
 await status(manager.team({action:'updateUser',id:editor.id,version:1,status:'disabled'}),403,'manager cannot disable');
 const me=(await team()).find(u=>u.role==='owner');
 await status(owner.team({action:'updateUser',id:me.id,version:me.version,role:'viewer'}),400,'no self-demotion');
 let ed=await find(editor.id);await ok(owner.team({action:'updateUser',id:ed.id,version:ed.version,status:'disabled'}),'disable editor');
 await status(editor.ws(),401,'disabled user session ends');
 await status(client(mf).auth({action:'login',email:'editor@lub.test',password:'member-password-123'}),403,'disabled user cannot log in');
 await status(owner.team({action:'resetLink',id:editor.id}),400,'no reset link for disabled user');
 await status(owner.team({action:'updateUser',id:ed.id,version:ed.version,status:'active'}),409,'stale account version');
 ed=await find(editor.id);await ok(owner.team({action:'updateUser',id:ed.id,version:ed.version,status:'active'}),'re-enable');
 let v=await find(viewer.id);await ok(owner.team({action:'updateUser',id:v.id,version:v.version,role:'publisher'}),'role change');
 await status(viewer.ws(),401,'role change ends existing sessions');
 const reset=await ok(owner.team({action:'resetLink',id:editor.id}));assert.match(reset.link,/#reset=/);
 const editor2=client(mf);await ok(editor2.auth({action:'resetPassword',token:tokenFrom(reset.link),password:'new-editor-password-1'}),'reset password');
 await status(client(mf).auth({action:'resetPassword',token:tokenFrom(reset.link),password:'another-password-12'}),410,'reset link single use');
 await status(client(mf).auth({action:'login',email:'editor@lub.test',password:'member-password-123'}),401,'old password rejected');
 await ok(client(mf).auth({action:'login',email:'editor@lub.test',password:'new-editor-password-1'}),'new password works');
 // Promote a second owner, then the first can be demoted by them but never the last one.
 let mg=await find(manager.id);await ok(owner.team({action:'updateUser',id:mg.id,version:mg.version,role:'owner'}),'second owner');
 const owner2=client(mf);await ok(owner2.auth({action:'login',email:'manager@lub.test',password:'member-password-123'}));
 let o1=await find(me.id);await ok(owner2.team({action:'updateUser',id:o1.id,version:o1.version,status:'disabled'}),'owner2 disables owner1');
 await status(owner.ws(),401,'disabled owner is out');
 // Owner recovery with the server secret re-enables the account.
 await status(client(mf).auth({action:'recoverOwner',email:'owner@lub.test',password:'recovered-password-1',setupToken:'wrong'}),403,'recovery needs the secret');
 await ok(client(mf).auth({action:'recoverOwner',email:'owner@lub.test',password:'recovered-password-1',setupToken:SETUP_TOKEN}),'owner recovery');
 console.log('PASS: anonymous and forged-header rejection, owner setup secret, password hashing, login throttle, invitations (single use, expiry, revoke, member link), role permissions on every story/task/member action, publisher-only publishing, activity log with actors, disable/role change ends sessions, last-owner guard, reset links, owner recovery');
}finally{await mf.dispose();}

// Sites mode: headers from the Sites dispatch become the identity; unknown identities get nothing.
{
 const {mf}=await startWorker('sites',{LUB_AUTH_MODE:'sites',LUB_SETUP_TOKEN:''});
 try{
  const h={'oai-authenticated-user-id':'sites-owner','oai-authenticated-user-email':'owner@lub.test','oai-authenticated-user-full-name':encodeURIComponent('مالك سايتس'),'oai-authenticated-user-full-name-encoding':'percent-encoded-utf-8'};
  const o=client(mf,h);const st=await ok(o.request('/api/auth'));assert.equal(st.mode,'sites');assert.equal(st.sites.name,'مالك سايتس');
  await ok(o.auth({action:'setup',name:'مالك سايتس',email:'owner@lub.test',password:'owner-password-123'}),'sites setup without secret');
  o.cookie='';await ok(o.ws(),'Sites identity signs in without a cookie');
  const stranger=client(mf,{'oai-authenticated-user-id':'someone-else','oai-authenticated-user-email':'x@lub.test'});await status(stranger.ws(),401,'unknown Sites identity');
  await status(stranger.auth({action:'recoverOwner',email:'owner@lub.test',password:'recovered-password-1',setupToken:''}),503,'recovery disabled without a secret');
  console.log('PASS: Sites mode trusts dispatch identity only for registered accounts');
 }finally{await mf.dispose();}
}
// Local mode without a configured secret cannot be bootstrapped.
{
 const {mf}=await startWorker('nosecret',{LUB_SETUP_TOKEN:''});
 try{await status(client(mf).auth({action:'setup',setupToken:'',name:'مالك',email:'owner@lub.test',password:'owner-password-123'}),503,'setup needs a configured secret');console.log('PASS: setup refused without LUB_SETUP_TOKEN');}
 finally{await mf.dispose();}
}
