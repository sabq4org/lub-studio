import {z} from 'zod';
import {database,initialize,workspace} from '@/lib/storage';
import {approvalBlockers,blockers,series,topics,formats,labels,sourceKinds,claimKinds,outputFormats,platforms,checklistItems,type Status} from '@/lib/model';
import {approvalFields,contentHash,snapshot,commentIf} from '@/lib/editorial';
import {currentUser,fail,forbidden,json,readBody,unauthorized,type SessionUser} from '@/lib/auth';
import {assignmentFields,assignmentLabels,can,canChecklist,canEditField,canTransition} from '@/lib/roles';
const text=(max:number)=>z.string().trim().max(max);
const link=z.union([z.literal(''),z.string().max(2000).url().refine(s=>/^https?:\/\//.test(s),'الرابط يجب أن يبدأ بـ https:// أو http://')]);
const day=z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const person=text(100).optional().default('');
const itemId=z.string().regex(/^[A-Za-z0-9_-]{1,60}$/);
const source=z.object({id:itemId,url:link,publisher:text(200),title:text(300).default(''),publishedAt:day,accessedAt:day,kind:z.enum(sourceKinds)});
const claim=z.object({id:itemId,text:text(1000).min(1),figure:text(120).default(''),kind:z.enum(claimKinds),sourceIds:z.array(itemId).max(20),verified:z.boolean()});
const output=z.object({id:itemId,platform:z.enum(platforms),format:z.enum(outputFormats),parts:z.array(text(4000)).min(1).max(25),assetUrl:link});
const storyInput=z.object({title:text(200).min(3),series:z.enum(series as [string,...string[]]),topic:z.enum(topics as [string,...string[]]),format:z.enum(formats as [string,...string[]]),owner:text(100),researcher:person,writer:person,producer:person,reviewer:person,priority:z.enum(['عادية','عالية']),due:day,plannedAt:z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)]),angle:text(4000),audience:text(1000).optional().default(''),script:text(16000),sources:z.array(source).max(30).optional().default([]),claims:z.array(claim).max(60).optional().default([]),outputs:z.array(output).max(10).optional().default([]),sourceUrl:link.optional().default(''),sourceNote:text(5000),sourceVerified:z.boolean(),rightsVerified:z.boolean(),assetUrl:link}).superRefine((s,ctx)=>{const ids=new Set(s.sources.map(x=>x.id));if(ids.size!==s.sources.length)ctx.addIssue({code:'custom',path:['sources'],message:'معرّف مصدر مكرر'});for(const c of s.claims)for(const id of c.sourceIds)if(!ids.has(id))ctx.addIssue({code:'custom',path:['claims'],message:'ادعاء مربوط بمصدر غير موجود'});});
const memberInput=z.object({name:text(80).min(2),role:text(100).min(2)});
const taskInput=z.object({title:text(200).min(3),owner:text(100),phase:z.enum(['التأسيس','الإطلاق','التحسين','التوسع']),acceptance:text(3000),due:day,done:z.boolean()});
const fieldLabels:Record<string,string>={title:'العنوان',series:'السلسلة',topic:'المجال',format:'القالب',priority:'الأولوية',due:'موعد التسليم',plannedAt:'موعد النشر',angle:'الزاوية',audience:'الجمهور',sources:'المصادر',claims:'الادعاءات والأرقام',outputs:'مخرجات المنصات',script:'النص',sourceUrl:'المصدر',sourceNote:'توثيق المصادر',sourceVerified:'التحقق من المصدر',rightsVerified:'تأكيد الحقوق',assetUrl:'رابط الأصل',...assignmentLabels};
const allowed:Record<string,string[]>={idea:['research','archived'],research:['production','archived'],production:['review','research','archived'],review:['approved','production','archived'],approved:['planned','published','production','archived'],planned:['published','approved','production','archived'],published:['archived'],archived:['idea']};

// Assignees may be accounts (active) or legacy attribution members.
async function validPerson(db:D1Database,id:string){if(!id)return true;return !!(await db.prepare("SELECT id FROM lub_users WHERE id=? AND status='active'").bind(id).first()||await db.prepare("SELECT id FROM lub_records WHERE id=? AND kind='member'").bind(id).first());}
async function checkPeople(db:D1Database,data:Record<string,unknown>,fields:readonly string[]){for(const f of fields){const v=data[f];if(typeof v==='string'&&v&&!await validPerson(db,v))return `${fieldLabels[f]||'المسؤول'}: الشخص المحدد غير موجود أو حسابه معطل`;}return '';}
// Activity row written in the same transaction, only if the guarded update actually landed.
function logIf(db:D1Database,me:SessionUser,action:string,kind:string,id:string,version:number,at:string,summary:string,details?:unknown){
 return db.prepare('INSERT INTO lub_activity (id,at,actor_id,actor_name,action,entity_kind,entity_id,summary,details) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM lub_records WHERE id=? AND version=? AND updated_at=?)')
  .bind(crypto.randomUUID(),at,me.id,me.name,action,kind,id,summary,details===undefined?null:JSON.stringify(details),id,version,at);
}

export async function GET(req:Request){try{const db=database();const me=await currentUser(db,req);if(!me)return unauthorized();await initialize(db);return json({...await workspace(db),me});}catch(e){console.error('load workspace',e instanceof Error?e.message:'unknown');return fail('تعذر تحميل مساحة العمل. أعد المحاولة بعد قليل.',503);}}
export async function POST(req:Request){
 try{
 const parsed=await readBody(req,400000);if('error' in parsed)return parsed.error;const b=parsed.body;
 const db=database();const me=await currentUser(db,req);if(!me)return unauthorized();if(me.role==='viewer')return forbidden('حساب المشاهد للاطلاع فقط.');
 await initialize(db);const now=new Date().toISOString();const by={by:me.name,byId:me.id};
 if(b.action==='createStory'||b.action==='createTask'||b.action==='createMember'){
  const kind=b.action==='createStory'?'story':b.action==='createTask'?'task':'member';
  if(!can(me,kind==='story'?'story.create':kind==='task'?'task.manage':'member.manage'))return forbidden();
  const data:Record<string,unknown>=(kind==='story'?storyInput:kind==='task'?taskInput:memberInput).parse(b.data);const id=crypto.randomUUID();
  if(kind==='story'&&!can(me,'story.manage')){for(const f of assignmentFields)data[f]='';data.owner=me.id;data.researcher=me.id;data.due='';data.plannedAt='';data.priority='عادية';}
  const problem=await checkPeople(db,data,kind==='story'?assignmentFields:kind==='task'?['owner']:[]);if(problem)return fail(problem);
  const p={...data,id,...(kind==='story'?{status:'idea',postUrl:'',contentVersion:1,history:[{at:now,message:'إنشاء القصة',...by}]}:{})};
  const title=String(data.title||data.name);
  await db.batch([db.prepare('INSERT INTO lub_records (id,kind,payload,version,updated_at) VALUES (?,?,?,1,?)').bind(id,kind,JSON.stringify(p),now),logIf(db,me,kind+'.create',kind,id,1,now,(kind==='story'?'إنشاء قصة: ':kind==='task'?'إنشاء مهمة: ':'إضافة عضو إسناد: ')+title),...(kind==='story'?[await snapshot(db,me,p,1,'إنشاء القصة',1,now)]:[])]);
  return json({workspace:{...await workspace(db),me},id});
 }
 if(!['saveStory','transition','setChecklist','saveTask','saveMember'].includes(String(b.action)))return fail('الإجراء غير معروف');
 if(typeof b.id!=='string'||!Number.isInteger(b.version))return fail('بيانات النسخة غير مكتملة');const version=b.version as number;
 const row=await db.prepare('SELECT kind,payload,version FROM lub_records WHERE id=?').bind(b.id).first<{kind:string;payload:string;version:number}>();if(!row)return fail('العنصر غير موجود',404);if(row.version!==version)return fail('تغيرت هذه المادة في جلسة أخرى. حدّث البيانات قبل الحفظ.',409);
 const old=JSON.parse(row.payload);let next={...old};let message='';let action='';let summary='';let details:unknown;const extra:D1PreparedStatement[]=[];
 if(b.action==='saveStory'){
 if(row.kind!=='story')return fail('نوع غير صحيح');const changes:Record<string,unknown>=storyInput.parse(b.data);
 const changedKeys=Object.keys(changes).filter(k=>JSON.stringify(old[k]??'')!==JSON.stringify(changes[k]??''));
 const denied=changedKeys.filter(k=>!canEditField(me,old,k));if(denied.length)return forbidden('لا تملك صلاحية تعديل: '+denied.map(k=>fieldLabels[k]||k).join('، '));
 const problem=await checkPeople(db,changes,assignmentFields.filter(f=>changedKeys.includes(f)));if(problem)return fail(problem);
 const changed=approvalFields.some(k=>changedKeys.includes(k));
 next={...old,...changes};
 if(changed){next.contentVersion=(old.contentVersion||0)+1;next.checklist={};next.checklistBy='';next.checklistAt='';extra.push(await snapshot(db,me,next,next.contentVersion,'تعديل المحتوى',version+1,now));}
 if(changed&&['review','approved','planned','published'].includes(old.status)){next.status='production';next.plannedAt='';Object.assign(next,{approvedBy:'',approvedAt:'',approvedHash:'',approvedContentVersion:0});message=old.status==='planned'?'تعديل مادة مجدولة: أُلغيت جدولتها وأعيدت للإنتاج؛ يلزم اعتماد النسخة الجديدة':'تعديل المادة وإعادتها للإنتاج؛ يلزم اعتماد النسخة الجديدة';}else message=changed?`حفظ الإصدار ${next.contentVersion} من المحتوى`:'حفظ تعديل القصة';
 action='story.update';summary=`${message}: ${old.title}`;details={fields:changedKeys,...(next.status!==old.status?{from:old.status,to:next.status}:{})};
 if(!changedKeys.length)return json({workspace:{...await workspace(db),me},id:b.id});
 }else if(b.action==='transition'){
 if(row.kind!=='story')return fail('نوع غير صحيح');const target=b.target as Status;
 if(!allowed[old.status]?.includes(target))return fail('هذا الانتقال غير متاح من الحالة الحالية');
 if(!canTransition(me,old,target))return forbidden('لا تملك صلاحية نقل القصة إلى «'+labels[target]+'».');
 if(['review','approved','planned','published'].includes(target)){const missing=(target==='approved'?approvalBlockers:blockers)(old);if(missing.length)return fail('قبل المتابعة: '+missing.join('، '));}
 const hash=await contentHash(old);
 if((target==='planned'||target==='published')&&(!old.approvedHash||old.approvedHash!==hash))return fail('المحتوى الحالي ليس النسخة المعتمدة. أعد المادة للمراجعة واعتمدها من جديد.',409);
 const returning=old.status==='review'&&(target==='production'||target==='research');const note=typeof b.note==='string'?b.note.trim():'';
 if(returning&&(note.length<5||note.length>4000))return fail('اكتب سبب الإرجاع وما يجب تعديله (5 أحرف على الأقل).');
 if(returning)extra.push(commentIf(db,me,b.id,'review_note',note,version+1,now));
 if(target==='planned'&&!old.plannedAt)return fail('حدد موعد النشر المقترح واحفظه أولًا');
 if(target==='published'){const url=link.parse(b.postUrl);if(!/^https:\/\/(www\.)?(x\.com|twitter\.com)\/[^/]+\/status\/\d+/.test(url))return fail('أدخل رابط منشور X الفعلي لتوثيق النشر اليدوي');next.postUrl=url;next.publishedBy=me.id;next.publishedAt=now;}
 if(target==='approved'&&old.status==='review'){if(!old.contentVersion){next.contentVersion=1;extra.push(await snapshot(db,me,old,1,'نسخة أساس عند الاعتماد',version+1,now));}Object.assign(next,{approvedBy:me.id,approvedAt:now,approvedHash:hash,approvedContentVersion:next.contentVersion});}
 if(['production','research','idea','archived'].includes(target))Object.assign(next,{approvedBy:'',approvedAt:'',approvedHash:'',approvedContentVersion:0});
 next.status=target;message=target==='published'?'توثيق رابط نشر يدوي؛ لم ينشر النظام إلى X':target==='planned'?'إضافة إلى خطة النشر؛ الإرسال التلقائي غير متصل':target==='approved'&&old.status==='planned'?'إلغاء الجدولة وإبقاء المادة معتمدة':target==='approved'?`اعتماد الإصدار ${next.contentVersion} من المحتوى`:returning?`إرجاع من المراجعة: ${note.slice(0,200)}`:target==='production'?'إعادة للإنتاج':target==='research'?'إعادة للبحث':'تغيير مرحلة العمل';
 action='story.transition';summary=`${message}: ${old.title}`;details={from:old.status,to:target,version:version+1};
 }else if(b.action==='setChecklist'){
  if(row.kind!=='story')return fail('نوع غير صحيح');if(!canChecklist(me,old))return forbidden('قائمة التحقق متاحة لمراجع القصة ومدير التحرير أثناء المراجعة.');
  const input=z.record(z.string(),z.boolean()).parse(b.checklist);const keys=checklistItems.map(([k])=>k) as string[];
  if(Object.keys(input).some(k=>!keys.includes(k)))return fail('بند غير معروف في قائمة التحقق');
  next.checklist=Object.fromEntries(keys.map(k=>[k,!!input[k]]));next.checklistBy=me.id;next.checklistAt=now;
  const done=keys.filter(k=>input[k]).length;message=`تحديث قائمة تحقق المراجعة (${done} من ${keys.length})`;action='story.checklist';summary=`${message}: ${old.title}`;details={checklist:next.checklist};
 }else if(b.action==='saveTask'){
  if(row.kind!=='task')return fail('نوع غير صحيح');const changes=taskInput.parse(b.data);
  if(!can(me,'task.manage')){const keys=(Object.keys(changes) as (keyof typeof changes)[]).filter(k=>JSON.stringify(old[k]??'')!==JSON.stringify(changes[k]));if(old.owner!==me.id||keys.some(k=>k!=='done'))return forbidden('يمكنك تحديث إنجاز مهامك المسندة إليك فقط.');}
  const problem=await checkPeople(db,changes,changes.owner!==old.owner?['owner']:[]);if(problem)return fail(problem);
  next={...old,...changes};action='task.update';summary=(changes.done&&!old.done?'إنجاز مهمة: ':'تعديل مهمة: ')+changes.title;
 }else{if(row.kind!=='member')return fail('نوع غير صحيح');if(!can(me,'member.manage'))return forbidden();next={...old,...memberInput.parse(b.data)};action='member.update';summary='تعديل عضو إسناد: '+next.name;}
 if(message)next.history=[{at:now,message,...by},...(old.history||[])].slice(0,80);
 const [result]=await db.batch([db.prepare('UPDATE lub_records SET payload=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(JSON.stringify(next),now,b.id,version),logIf(db,me,action,row.kind,b.id,version+1,now,summary,details),...extra]);
 if(!result.meta.changes)return fail('تعارض في النسخة؛ حدّث البيانات ثم حاول مجددًا.',409);
 return json({workspace:{...await workspace(db),me},id:b.id});
 }catch(e){if(e instanceof z.ZodError)return fail('تحقق من الحقول: '+e.issues.map(x=>x.path.join('.')+' '+x.message).join('، '));console.error('save workspace',e instanceof Error?e.message:'unknown');return fail('تعذر الحفظ. بقيت مدخلاتك كما هي؛ حاول مجددًا.',503);}
}
