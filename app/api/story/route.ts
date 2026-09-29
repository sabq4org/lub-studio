import {z} from 'zod';
import {database} from '@/lib/storage';
import {activity,currentUser,fail,forbidden,json,readBody,unauthorized} from '@/lib/auth';
import {can,canComment} from '@/lib/roles';

type CommentRow={id:string;story_id:string;kind:string;body:string;author_id:string|null;author_name:string;created_at:string;resolved_at:string|null;resolved_by:string|null};
type VersionRow={id:string;n:number;hash:string;payload:string;reason:string;actor_id:string|null;actor_name:string;at:string};
const storyExists=async(db:D1Database,id:string)=>await db.prepare("SELECT payload FROM lub_records WHERE id=? AND kind='story'").bind(id).first<{payload:string}>();

// Comments and content versions of one story. Every signed-in member may read them.
export async function GET(req:Request){
 try{
  const db=database(),me=await currentUser(db,req);if(!me)return unauthorized();
  const id=new URL(req.url).searchParams.get('id')||'';const story=await storyExists(db,id);if(!story)return fail('القصة غير موجودة',404);
  const [c,v]=await db.batch([
   db.prepare('SELECT * FROM lub_comments WHERE story_id=? ORDER BY created_at DESC LIMIT 200').bind(id),
   db.prepare('SELECT * FROM lub_story_versions WHERE story_id=? ORDER BY n DESC LIMIT 100').bind(id)
  ]);
  const approvedHash=JSON.parse(story.payload).approvedHash||'';
  return json({
   comments:(c.results as CommentRow[]).map(r=>({id:r.id,kind:r.kind,body:r.body,authorId:r.author_id,authorName:r.author_name,createdAt:r.created_at,resolvedAt:r.resolved_at,resolvedBy:r.resolved_by})),
   versions:(v.results as VersionRow[]).map(r=>({id:r.id,n:r.n,hash:r.hash,content:JSON.parse(r.payload),reason:r.reason,actorId:r.actor_id,actorName:r.actor_name,at:r.at,approved:!!approvedHash&&r.hash===approvedHash}))
  });
 }catch(e){console.error('story detail',e instanceof Error?e.message:'unknown');return fail('تعذر تحميل تفاصيل القصة.',503);}
}

export async function POST(req:Request){
 try{
  const parsed=await readBody(req,20000);if('error' in parsed)return parsed.error;const b=parsed.body;
  const db=database(),me=await currentUser(db,req);if(!me)return unauthorized();if(!canComment(me))return forbidden('حساب المشاهد للاطلاع فقط.');
  const now=new Date().toISOString();
  if(b.action==='comment'){
   const input=z.object({storyId:z.string().max(100),body:z.string().trim().min(1).max(4000),kind:z.enum(['comment','decision']).default('comment')}).safeParse(b);if(!input.success)return fail('اكتب التعليق (حتى 4000 حرف)');
   const story=await storyExists(db,input.data.storyId);if(!story)return fail('القصة غير موجودة',404);
   if(input.data.kind==='decision'&&!can(me,'story.manage'))return forbidden('تسجيل القرارات التحريرية لمدير التحرير والمالك.');
   const id=crypto.randomUUID(),title=JSON.parse(story.payload).title;
   await db.batch([
    db.prepare('INSERT INTO lub_comments (id,story_id,kind,body,author_id,author_name,created_at) VALUES (?,?,?,?,?,?,?)').bind(id,input.data.storyId,input.data.kind,input.data.body,me.id,me.name,now),
    activity(db,me,input.data.kind==='decision'?'story.decision':'story.comment','story',input.data.storyId,(input.data.kind==='decision'?'قرار تحريري على: ':'تعليق على: ')+title)
   ]);
   return json({id});
  }
  if(b.action==='resolve'){
   const id=z.string().max(100).safeParse(b.id);if(!id.success)return fail('التعليق غير محدد');
   const row=await db.prepare('SELECT * FROM lub_comments WHERE id=?').bind(id.data).first<CommentRow>();if(!row)return fail('التعليق غير موجود',404);
   if(row.author_id!==me.id&&!can(me,'story.manage')&&me.role!=='reviewer')return forbidden('يغلق الملاحظة كاتبها أو المراجع أو مدير التحرير.');
   if(row.resolved_at)return json({ok:true});
   await db.batch([db.prepare('UPDATE lub_comments SET resolved_at=?,resolved_by=? WHERE id=? AND resolved_at IS NULL').bind(now,me.name,row.id),activity(db,me,'story.comment_resolved','story',row.story_id,'إغلاق ملاحظة')]);
   return json({ok:true});
  }
  return fail('الإجراء غير معروف');
 }catch(e){console.error('story action',e instanceof Error?e.message:'unknown');return fail('تعذر الحفظ. حاول مجددًا.',503);}
}
