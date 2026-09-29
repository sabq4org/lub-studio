import {z} from 'zod';
import {database} from '@/lib/storage';
import {activity,attemptAllowed,authMode,clearFailures,clearedCookie,createSession,currentUser,endSession,fail,hashPassword,json,passwordProblem,readBody,recordFailure,safeEqual,sessionCookie,setupToken,sha256,sitesIdentity,toSessionUser,userCount,verifyPassword,type UserRow} from '@/lib/auth';

type TokenRow={id:string;kind:string;email:string;name:string;role:string;user_id:string|null;member_id:string|null;created_by:string;expires_at:string;used_at:string|null;revoked_at:string|null};
const email=z.string().trim().toLowerCase().email().max(200);
const name=z.string().trim().min(2).max(80);
const tokenText=z.string().min(20).max(200);
const UNKNOWN_USER_HASH='pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

async function loadToken(db:D1Database,token:string,kind:'invite'|'reset'){
 const row=await db.prepare('SELECT * FROM lub_tokens WHERE id=? AND kind=?').bind(await sha256(token),kind).first<TokenRow>();
 if(!row)return {error:'الرابط غير صالح. اطلب رابطًا جديدًا من مالك المساحة.'};
 if(row.revoked_at)return {error:'أُلغي هذا الرابط. اطلب رابطًا جديدًا.'};
 if(row.used_at)return {error:'استُخدم هذا الرابط من قبل. سجّل الدخول أو اطلب رابطًا جديدًا.'};
 if(row.expires_at<new Date().toISOString())return {error:'انتهت صلاحية الرابط. اطلب رابطًا جديدًا.'};
 return {row};
}
// Marks the token used exactly once; a concurrent second use gets false.
async function consume(db:D1Database,id:string){const r=await db.prepare('UPDATE lub_tokens SET used_at=? WHERE id=? AND used_at IS NULL AND revoked_at IS NULL').bind(new Date().toISOString(),id).run();return r.meta.changes===1;}

export async function GET(req:Request){
 try{
  const db=database(),mode=authMode(),users=await userCount(db),user=await currentUser(db,req),sites=sitesIdentity(req);
  return json({mode,user,setupRequired:users===0,setupConfigured:mode==='sites'?!!sites:!!setupToken(),sites:users===0&&sites?{email:sites.email,name:sites.name}:null});
 }catch(e){console.error('auth status',e instanceof Error?e.message:'unknown');return fail('تعذر التحقق من الجلسة. أعد المحاولة بعد قليل.',503);}
}

export async function POST(req:Request){
 try{
  const parsed=await readBody(req,20000);if('error' in parsed)return parsed.error;const b=parsed.body;const db=database();const now=new Date().toISOString();
  if(b.action==='login'){
   const input=z.object({email,password:z.string().max(200)}).safeParse(b);if(!input.success)return fail('أدخل البريد وكلمة المرور');
   const key='login:'+input.data.email;if(!await attemptAllowed(db,key))return fail('محاولات دخول كثيرة. انتظر 15 دقيقة ثم أعد المحاولة.',429);
   const row=await db.prepare('SELECT * FROM lub_users WHERE email=?').bind(input.data.email).first<UserRow>();
   // Unknown e-mails still pay the hashing cost so response time does not reveal which accounts exist.
   const ok=await verifyPassword(input.data.password,row?.password_hash||UNKNOWN_USER_HASH)&&!!row;
   if(!row||!ok){await recordFailure(db,key);return fail('البريد أو كلمة المرور غير صحيحة',401);}
   if(row.status!=='active')return fail('هذا الحساب معطل. تواصل مع مالك المساحة.',403);
   await clearFailures(db,key);const token=await createSession(db,row.id);
   await activity(db,{id:row.id,name:row.name},'auth.login','user',row.id,'تسجيل دخول').run();
   return json({user:toSessionUser(row)},200,{'Set-Cookie':sessionCookie(req,token)});
  }
  if(b.action==='logout'){
   const user=await currentUser(db,req);await endSession(db,req);
   if(user)await activity(db,user,'auth.logout','user',user.id,'تسجيل خروج').run();
   return json({ok:true},200,{'Set-Cookie':clearedCookie(req)});
  }
  if(b.action==='setup'){
   const input=z.object({name,email,password:z.string(),setupToken:z.string().max(500).optional()}).safeParse(b);if(!input.success)return fail('أكمل الاسم والبريد الصحيح');
   const pw=passwordProblem(input.data.password);if(pw)return fail(pw);
   if(await userCount(db)>0)return fail('المساحة مهيأة بالفعل. سجّل الدخول.',409);
   const mode=authMode(),sites=sitesIdentity(req);
   if(mode==='local'){
    const configured=setupToken();if(!configured)return fail('تهيئة المالك تتطلب ضبط LUB_SETUP_TOKEN في أسرار الخادم.',503);
    if(!await attemptAllowed(db,'setup'))return fail('محاولات كثيرة. انتظر 15 دقيقة.',429);
    if(!await safeEqual(input.data.setupToken||'',configured)){await recordFailure(db,'setup');return fail('رمز التهيئة غير صحيح',403);}
   }else if(!sites)return fail('تعذر قراءة هوية Sites لهذا الطلب.',401);
   const id=crypto.randomUUID();
   const r=await db.prepare("INSERT INTO lub_users (id,email,name,role,status,password_hash,sites_user_id,created_at,updated_at,version) SELECT ?,?,?,'owner','active',?,?,?,?,1 WHERE NOT EXISTS (SELECT 1 FROM lub_users)")
    .bind(id,input.data.email,input.data.name,await hashPassword(input.data.password),sites?.userId||null,now,now).run();
   if(r.meta.changes!==1)return fail('المساحة مهيأة بالفعل. سجّل الدخول.',409);
   await activity(db,{id,name:input.data.name},'team.setup','user',id,'تهيئة المساحة وإنشاء حساب المالك').run();
   const token=await createSession(db,id);const row=await db.prepare('SELECT * FROM lub_users WHERE id=?').bind(id).first<UserRow>();
   return json({user:toSessionUser(row!)},200,{'Set-Cookie':sessionCookie(req,token)});
  }
  if(b.action==='inspectToken'){
   const input=z.object({token:tokenText,kind:z.enum(['invite','reset'])}).safeParse(b);if(!input.success)return fail('الرابط غير صالح');
   const t=await loadToken(db,input.data.token,input.data.kind);if('error' in t)return fail(t.error!,410);
   return json({kind:t.row.kind,email:t.row.email,name:t.row.name,role:t.row.role,expiresAt:t.row.expires_at});
  }
  if(b.action==='acceptInvite'){
   const input=z.object({token:tokenText,name,password:z.string()}).safeParse(b);if(!input.success)return fail('أكمل الاسم وكلمة المرور');
   const pw=passwordProblem(input.data.password);if(pw)return fail(pw);
   const t=await loadToken(db,input.data.token,'invite');if('error' in t)return fail(t.error!,410);const inv=t.row;
   if(await db.prepare('SELECT id FROM lub_users WHERE email=?').bind(inv.email).first())return fail('يوجد حساب بهذا البريد. سجّل الدخول.',409);
   const memberFree=inv.member_id&&!await db.prepare('SELECT id FROM lub_users WHERE id=?').bind(inv.member_id).first()&&await db.prepare("SELECT id FROM lub_records WHERE id=? AND kind='member'").bind(inv.member_id).first();
   const id=memberFree?inv.member_id!:crypto.randomUUID();
   const sites=sitesIdentity(req),sitesFree=sites&&!await db.prepare('SELECT id FROM lub_users WHERE sites_user_id=?').bind(sites.userId).first();
   if(!await consume(db,inv.id))return fail('استُخدم هذا الرابط من قبل.',410);
   await db.batch([
    db.prepare("INSERT INTO lub_users (id,email,name,role,status,password_hash,sites_user_id,created_at,updated_at,version) VALUES (?,?,?,?,'active',?,?,?,?,1)").bind(id,inv.email,input.data.name,inv.role,await hashPassword(input.data.password),sitesFree?sites!.userId:null,now,now),
    activity(db,{id,name:input.data.name},'team.invite_accepted','user',id,'قبول الدعوة وتفعيل الحساب',{role:inv.role,invitedBy:inv.created_by,linkedMember:memberFree?inv.member_id:null})
   ]);
   const token=await createSession(db,id);const row=await db.prepare('SELECT * FROM lub_users WHERE id=?').bind(id).first<UserRow>();
   return json({user:toSessionUser(row!)},200,{'Set-Cookie':sessionCookie(req,token)});
  }
  if(b.action==='resetPassword'){
   const input=z.object({token:tokenText,password:z.string()}).safeParse(b);if(!input.success)return fail('أدخل كلمة مرور جديدة');
   const pw=passwordProblem(input.data.password);if(pw)return fail(pw);
   const t=await loadToken(db,input.data.token,'reset');if('error' in t)return fail(t.error!,410);
   const row=await db.prepare('SELECT * FROM lub_users WHERE id=?').bind(t.row.user_id).first<UserRow>();
   if(!row||row.status!=='active')return fail('الحساب غير متاح أو معطل.',403);
   if(!await consume(db,t.row.id))return fail('استُخدم هذا الرابط من قبل.',410);
   await db.batch([
    db.prepare('UPDATE lub_users SET password_hash=?,updated_at=?,version=version+1 WHERE id=?').bind(await hashPassword(input.data.password),now,row.id),
    db.prepare('DELETE FROM lub_sessions WHERE user_id=?').bind(row.id),
    activity(db,{id:row.id,name:row.name},'auth.password_reset','user',row.id,'تعيين كلمة مرور جديدة عبر رابط الاستعادة')
   ]);
   const token=await createSession(db,row.id);
   return json({user:toSessionUser({...row,version:row.version+1})},200,{'Set-Cookie':sessionCookie(req,token)});
  }
  if(b.action==='recoverOwner'){
   const input=z.object({email,password:z.string(),setupToken:z.string().max(500)}).safeParse(b);if(!input.success)return fail('أكمل البيانات المطلوبة');
   const pw=passwordProblem(input.data.password);if(pw)return fail(pw);
   const configured=setupToken();if(!configured)return fail('استعادة المالك تتطلب ضبط LUB_SETUP_TOKEN في أسرار الخادم.',503);
   if(!await attemptAllowed(db,'recover'))return fail('محاولات كثيرة. انتظر 15 دقيقة.',429);
   const row=await db.prepare("SELECT * FROM lub_users WHERE email=? AND role='owner'").bind(input.data.email).first<UserRow>();
   if(!await safeEqual(input.data.setupToken,configured)||!row){await recordFailure(db,'recover');return fail('بيانات الاستعادة غير صحيحة',403);}
   await db.batch([
    db.prepare("UPDATE lub_users SET password_hash=?,status='active',updated_at=?,version=version+1 WHERE id=?").bind(await hashPassword(input.data.password),now,row.id),
    db.prepare('DELETE FROM lub_sessions WHERE user_id=?').bind(row.id),
    activity(db,{id:row.id,name:row.name},'auth.owner_recovered','user',row.id,'استعادة وصول المالك برمز الخادم')
   ]);
   await clearFailures(db,'recover');const token=await createSession(db,row.id);
   return json({user:toSessionUser({...row,status:'active',version:row.version+1})},200,{'Set-Cookie':sessionCookie(req,token)});
  }
  return fail('الإجراء غير معروف');
 }catch(e){console.error('auth action',e instanceof Error?e.message:'unknown');return fail('تعذر إكمال الطلب. حاول مجددًا.',503);}
}
