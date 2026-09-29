import {z} from 'zod';
import {database,initialize,workspace} from '@/lib/storage';
import {blockers,series,topics,formats,type Story,type Status} from '@/lib/model';
const text=(max:number)=>z.string().trim().max(max);
const link=z.union([z.literal(''),z.string().max(2000).url().refine(s=>/^https?:\/\//.test(s),'الرابط يجب أن يبدأ بـ https:// أو http://')]);
const day=z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const storyInput=z.object({title:text(200).min(3),series:z.enum(series as [string,...string[]]),topic:z.enum(topics as [string,...string[]]),format:z.enum(formats as [string,...string[]]),owner:text(100),priority:z.enum(['عادية','عالية']),due:day,plannedAt:z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)]),angle:text(4000),script:text(16000),sourceUrl:link,sourceNote:text(5000),sourceVerified:z.boolean(),rightsVerified:z.boolean(),assetUrl:link});
const memberInput=z.object({name:text(80).min(2),role:text(100).min(2)});
const taskInput=z.object({title:text(200).min(3),owner:text(100),phase:z.enum(['التأسيس','الإطلاق','التحسين','التوسع']),acceptance:text(3000),due:day,done:z.boolean()});
function fail(message:string,status=400){return Response.json({error:message},{status});}
export async function GET(){try{const db=database();await initialize(db);return Response.json(await workspace(db),{headers:{'Cache-Control':'no-store'}});}catch(e){console.error('load workspace',e);return fail('تعذر تحميل مساحة العمل. أعد المحاولة بعد قليل.',503);}}
export async function POST(req:Request){
 try{
 if(req.headers.get('sec-fetch-site')==='cross-site')return fail('طلب غير مسموح',403);
 if(Number(req.headers.get('content-length')||0)>100000)return fail('حجم الطلب كبير',413);
 const raw=await req.text();if(raw.length>100000)return fail('حجم الطلب كبير',413);const b=JSON.parse(raw);const db=database();await initialize(db);const now=new Date().toISOString();
 if(b.action==='createStory'||b.action==='createTask'||b.action==='createMember'){
  const kind=b.action==='createStory'?'story':b.action==='createTask'?'task':'member';const data=(kind==='story'?storyInput:kind==='task'?taskInput:memberInput).parse(b.data);const id=crypto.randomUUID();
  if('owner' in data&&data.owner&&!await db.prepare('SELECT id FROM lub_records WHERE id=? AND kind=?').bind(data.owner,'member').first())return fail('المسؤول المحدد غير موجود');
  const p={...data,id,...(kind==='story'?{status:'idea',postUrl:'',history:[{at:now,message:'إنشاء القصة'}]}:{})};
  await db.prepare('INSERT INTO lub_records (id,kind,payload,version,updated_at) VALUES (?,?,?,1,?)').bind(id,kind,JSON.stringify(p),now).run();return Response.json({workspace:await workspace(db),id});
 }
 if(!['saveStory','transition','saveTask','saveMember'].includes(b.action))return fail('الإجراء غير معروف');
 if(typeof b.id!=='string'||!Number.isInteger(b.version))return fail('بيانات النسخة غير مكتملة');
 const row=await db.prepare('SELECT kind,payload,version FROM lub_records WHERE id=?').bind(b.id).first<{kind:string;payload:string;version:number}>();if(!row)return fail('العنصر غير موجود',404);if(row.version!==b.version)return fail('تغيرت هذه المادة في جلسة أخرى. حدّث البيانات قبل الحفظ.',409);
 const old=JSON.parse(row.payload);let next={...old};let message='';
 if(b.action==='saveStory'){
 if(row.kind!=='story')return fail('نوع غير صحيح');const changes=storyInput.parse(b.data);if(changes.owner&&!await db.prepare('SELECT id FROM lub_records WHERE id=? AND kind=?').bind(changes.owner,'member').first())return fail('المسؤول غير موجود');
 const changed=['title','script','sourceUrl','sourceNote','assetUrl','sourceVerified','rightsVerified','angle','format'].some(k=>JSON.stringify(old[k])!==JSON.stringify(changes[k as keyof typeof changes]));
 next={...old,...changes};if(changed&&['review','approved','planned','published'].includes(old.status)){next.status='production';next.plannedAt='';message='تعديل المادة وإعادتها للإنتاج؛ يلزم اعتماد النسخة الجديدة';}else message='حفظ تعديل القصة';
 }else if(b.action==='transition'){
 if(row.kind!=='story')return fail('نوع غير صحيح');const allowed:Record<string,string[]>={idea:['research','archived'],research:['production','archived'],production:['review','archived'],review:['approved','production','archived'],approved:['planned','published','production','archived'],planned:['published','production','archived'],published:['archived'],archived:['idea']};const target=b.target as Status;
 if(!allowed[old.status]?.includes(target))return fail('هذا الانتقال غير متاح من الحالة الحالية');
 if(['review','approved','planned','published'].includes(target)){const missing=blockers(old);if(missing.length)return fail('قبل المتابعة: '+missing.join('، '));}
 if(target==='planned'&&!old.plannedAt)return fail('حدد موعد النشر المقترح واحفظه أولًا');
 if(target==='published'){const url=link.parse(b.postUrl);if(!/^https:\/\/(www\.)?(x\.com|twitter\.com)\/[^/]+\/status\/\d+/.test(url))return fail('أدخل رابط منشور X الفعلي لتوثيق النشر اليدوي');next.postUrl=url;}
 next.status=target;message=target==='published'?'توثيق رابط نشر يدوي؛ لم ينشر النظام إلى X':target==='planned'?'إضافة إلى خطة النشر؛ الإرسال التلقائي غير متصل':target==='approved'?'اعتماد النسخة الحالية':target==='production'?'إعادة للإنتاج':'تغيير مرحلة العمل';
 }else if(b.action==='saveTask'){if(row.kind!=='task')return fail('نوع غير صحيح');next={...old,...taskInput.parse(b.data)};}else{if(row.kind!=='member')return fail('نوع غير صحيح');next={...old,...memberInput.parse(b.data)};}
 if(message)next.history=[{at:now,message},...(old.history||[])].slice(0,80);
 const result=await db.prepare('UPDATE lub_records SET payload=?,version=version+1,updated_at=? WHERE id=? AND version=?').bind(JSON.stringify(next),now,b.id,b.version).run();if(!result.meta.changes)return fail('تعارض في النسخة؛ حدّث البيانات ثم حاول مجددًا.',409);
 return Response.json({workspace:await workspace(db),id:b.id});
 }catch(e){if(e instanceof z.ZodError)return fail('تحقق من الحقول: '+e.issues.map(x=>x.path.join('.')+' '+x.message).join('، '));if(e instanceof SyntaxError)return fail('صيغة الطلب غير صالحة');console.error('save workspace',e);return fail('تعذر الحفظ. بقيت مدخلاتك كما هي؛ حاول مجددًا.',503);}
}
