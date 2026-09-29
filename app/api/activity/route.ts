import {database} from '@/lib/storage';
import {currentUser,fail,forbidden,json,unauthorized} from '@/lib/auth';
import {can} from '@/lib/roles';

type Row={id:string;at:string;actor_id:string|null;actor_name:string;action:string;entity_kind:string;entity_id:string|null;summary:string;details:string|null};
// Full log for managers; any signed-in member may read the log of a single story.
export async function GET(req:Request){
 try{
  const db=database(),me=await currentUser(db,req);if(!me)return unauthorized();
  const q=new URL(req.url).searchParams,entity=q.get('entity')||'',before=q.get('before')||'9999',limit=Math.min(Math.max(Number(q.get('limit'))||50,1),200);
  if(!entity&&!can(me,'activity.view'))return forbidden('سجل النشاط الكامل متاح للمالك ومدير التحرير.');
  if(entity&&!can(me,'activity.view')&&!await db.prepare("SELECT id FROM lub_records WHERE id=? AND kind='story'").bind(entity).first())return forbidden();
  const stmt=entity?db.prepare('SELECT * FROM lub_activity WHERE entity_id=? AND at<? ORDER BY at DESC LIMIT ?').bind(entity,before,limit):db.prepare('SELECT * FROM lub_activity WHERE at<? ORDER BY at DESC LIMIT ?').bind(before,limit);
  const {results}=await stmt.all<Row>();
  return json({entries:results.map(r=>({id:r.id,at:r.at,actorId:r.actor_id,actorName:r.actor_name,action:r.action,entityKind:r.entity_kind,entityId:r.entity_id,summary:r.summary,details:r.details?JSON.parse(r.details):null})),hasMore:results.length===limit});
 }catch(e){console.error('activity load',e instanceof Error?e.message:'unknown');return fail('تعذر تحميل سجل النشاط.',503);}
}
