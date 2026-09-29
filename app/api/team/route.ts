import {z} from 'zod';
import {database} from '@/lib/storage';
import {activity,currentUser,fail,forbidden,json,randomToken,readBody,sha256,unauthorized,type UserRow} from '@/lib/auth';
import {can,roles,roleLabels,type Role} from '@/lib/roles';

const INVITE_DAYS=7,RESET_HOURS=24;
type InviteRow={id:string;email:string;name:string;role:string;member_id:string|null;created_by:string;created_at:string;expires_at:string};

async function team(db:D1Database,details:boolean){
 const {results:users}=await db.prepare('SELECT * FROM lub_users ORDER BY created_at').all<UserRow>();
 const list=users.map(u=>({id:u.id,name:u.name,role:u.role,status:u.status,...(details?{email:u.email,lastLoginAt:u.last_login_at,createdAt:u.created_at,version:u.version,sitesLinked:!!u.sites_user_id}:{})}));
 if(!details)return {users:list,invites:[]};
 const {results:invites}=await db.prepare("SELECT id,email,name,role,member_id,created_by,created_at,expires_at FROM lub_tokens WHERE kind='invite' AND used_at IS NULL AND revoked_at IS NULL AND expires_at>? ORDER BY created_at DESC").bind(new Date().toISOString()).all<InviteRow>();
 return {users:list,invites:invites.map(i=>({id:i.id,email:i.email,name:i.name,role:i.role,memberId:i.member_id,createdBy:i.created_by,createdAt:i.created_at,expiresAt:i.expires_at}))};
}
const activeOwners=async(db:D1Database)=>(await db.prepare("SELECT COUNT(*) AS n FROM lub_users WHERE role='owner' AND status='active'").first<{n:number}>())?.n||0;

export async function GET(req:Request){
 try{const db=database(),me=await currentUser(db,req);if(!me)return unauthorized();return json(await team(db,can(me,'team.details')));}
 catch(e){console.error('team load',e instanceof Error?e.message:'unknown');return fail('تعذر تحميل الفريق.',503);}
}

export async function POST(req:Request){
 try{
  const parsed=await readBody(req,20000);if('error' in parsed)return parsed.error;const b=parsed.body;
  const db=database(),me=await currentUser(db,req);if(!me)return unauthorized();if(!can(me,'team.manage'))return forbidden('إدارة الحسابات متاحة للمالك فقط.');
  const now=new Date().toISOString(),origin=new URL(req.url).origin;
  if(b.action==='invite'){
   const input=z.object({email:z.string().trim().toLowerCase().email().max(200),name:z.string().trim().max(80).default(''),role:z.enum(roles),memberId:z.string().max(100).optional().default('')}).safeParse(b);
   if(!input.success)return fail('أدخل بريدًا صحيحًا ودورًا من القائمة');const d=input.data;
   if(await db.prepare('SELECT id FROM lub_users WHERE email=?').bind(d.email).first())return fail('يوجد حساب بهذا البريد بالفعل',409);
   if(d.memberId&&!await db.prepare("SELECT id FROM lub_records WHERE id=? AND kind='member'").bind(d.memberId).first())return fail('عضو الإسناد المحدد غير موجود');
   if(d.memberId&&await db.prepare('SELECT id FROM lub_users WHERE id=?').bind(d.memberId).first())return fail('عضو الإسناد مرتبط بحساب بالفعل',409);
   const token=randomToken(),id=await sha256(token),expires=new Date(Date.now()+INVITE_DAYS*86400000).toISOString();
   await db.batch([
    db.prepare("UPDATE lub_tokens SET revoked_at=? WHERE kind='invite' AND email=? AND used_at IS NULL AND revoked_at IS NULL").bind(now,d.email),
    db.prepare("INSERT INTO lub_tokens (id,kind,email,name,role,member_id,created_by,created_at,expires_at) VALUES (?,'invite',?,?,?,?,?,?,?)").bind(id,d.email,d.name,d.role,d.memberId||null,me.id,now,expires),
    activity(db,me,'team.invite','invite',id,`دعوة ${d.email} بدور ${roleLabels[d.role]}`,{email:d.email,role:d.role,memberId:d.memberId||null})
   ]);
   return json({link:`${origin}/#invite=${token}`,expiresAt:expires,team:await team(db,true)});
  }
  if(b.action==='revokeInvite'){
   const id=z.string().max(100).safeParse(b.id);if(!id.success)return fail('الدعوة غير محددة');
   const r=await db.prepare("UPDATE lub_tokens SET revoked_at=? WHERE id=? AND kind='invite' AND used_at IS NULL AND revoked_at IS NULL").bind(now,id.data).run();
   if(!r.meta.changes)return fail('الدعوة غير موجودة أو لم تعد صالحة',404);
   await activity(db,me,'team.invite_revoked','invite',id.data,'إلغاء دعوة').run();
   return json({team:await team(db,true)});
  }
  if(b.action==='updateUser'){
   const input=z.object({id:z.string().max(100),version:z.number().int(),name:z.string().trim().min(2).max(80).optional(),role:z.enum(roles).optional(),status:z.enum(['active','disabled']).optional()}).safeParse(b);
   if(!input.success)return fail('بيانات التعديل غير صالحة');const d=input.data;
   const row=await db.prepare('SELECT * FROM lub_users WHERE id=?').bind(d.id).first<UserRow>();if(!row)return fail('الحساب غير موجود',404);
   if(row.version!==d.version)return fail('تغير هذا الحساب في جلسة أخرى. حدّث البيانات.',409);
   const role=(d.role??row.role) as Role,status=d.status??row.status,name=d.name??row.name;
   if(row.id===me.id&&(role!==row.role||status!==row.status))return fail('لا يمكنك تغيير دورك أو تعطيل حسابك بنفسك. اطلب ذلك من مالك آخر.');
   if(row.role==='owner'&&row.status==='active'&&(role!=='owner'||status!=='active')&&await activeOwners(db)<2)return fail('يجب أن يبقى مالك نشط واحد على الأقل.');
   const changes:string[]=[];if(name!==row.name)changes.push('الاسم');if(role!==row.role)changes.push(`الدور: ${roleLabels[row.role as Role]||row.role} ← ${roleLabels[role]}`);if(status!==row.status)changes.push(status==='active'?'تفعيل الحساب':'تعطيل الحساب');
   if(!changes.length)return json({team:await team(db,true)});
   const statements=[db.prepare('UPDATE lub_users SET name=?,role=?,status=?,updated_at=?,version=version+1 WHERE id=? AND version=?').bind(name,role,status,now,row.id,row.version)];
   if(status==='disabled'||role!==row.role)statements.push(db.prepare('DELETE FROM lub_sessions WHERE user_id=?').bind(row.id));
   statements.push(activity(db,me,status!==row.status?(status==='active'?'team.user_enabled':'team.user_disabled'):'team.user_updated','user',row.id,`${row.name}: ${changes.join('، ')}`,{from:{role:row.role,status:row.status},to:{role,status}}));
   const [r]=await db.batch(statements);if(!r.meta.changes)return fail('تغير هذا الحساب في جلسة أخرى. حدّث البيانات.',409);
   return json({team:await team(db,true)});
  }
  if(b.action==='resetLink'){
   const id=z.string().max(100).safeParse(b.id);if(!id.success)return fail('الحساب غير محدد');
   const row=await db.prepare('SELECT * FROM lub_users WHERE id=?').bind(id.data).first<UserRow>();if(!row)return fail('الحساب غير موجود',404);
   if(row.status!=='active')return fail('فعّل الحساب أولًا ثم أنشئ رابط الاستعادة.');
   const token=randomToken(),tid=await sha256(token),expires=new Date(Date.now()+RESET_HOURS*3600000).toISOString();
   await db.batch([
    db.prepare("UPDATE lub_tokens SET revoked_at=? WHERE kind='reset' AND user_id=? AND used_at IS NULL AND revoked_at IS NULL").bind(now,row.id),
    db.prepare("INSERT INTO lub_tokens (id,kind,email,name,role,user_id,created_by,created_at,expires_at) VALUES (?,'reset',?,?,?,?,?,?,?)").bind(tid,row.email,row.name,row.role,row.id,me.id,now,expires),
    activity(db,me,'team.reset_link','user',row.id,`إنشاء رابط استعادة وصول لـ ${row.name}`)
   ]);
   return json({link:`${origin}/#reset=${token}`,expiresAt:expires});
  }
  return fail('الإجراء غير معروف');
 }catch(e){console.error('team action',e instanceof Error?e.message:'unknown');return fail('تعذر إكمال الطلب. حاول مجددًا.',503);}
}
