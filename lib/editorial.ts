import {sha256,type SessionUser} from './auth';

// Content whose change invalidates review and approval; the approval hash covers exactly these fields.
export const approvalFields=['title','format','angle','audience','script','sources','claims','outputs','sourceUrl','sourceNote','sourceVerified','assetUrl','rightsVerified'] as const;
export function reviewable(story:Record<string,unknown>){return Object.fromEntries(approvalFields.map(k=>[k,story[k]??null]));}
export async function contentHash(story:Record<string,unknown>){return sha256(JSON.stringify(approvalFields.map(k=>story[k]??null)));}

// Snapshot row inserted only if the guarded record update in the same batch landed.
export async function snapshot(db:D1Database,me:SessionUser,story:Record<string,unknown>&{id:string},n:number,reason:string,recordVersion:number,at:string){
 return db.prepare('INSERT INTO lub_story_versions (id,story_id,n,hash,payload,reason,actor_id,actor_name,at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM lub_records WHERE id=? AND version=? AND updated_at=?)')
  .bind(crypto.randomUUID(),story.id,n,await contentHash(story),JSON.stringify(reviewable(story)),reason,me.id,me.name,at,story.id,recordVersion,at);
}
export function commentIf(db:D1Database,me:SessionUser,storyId:string,kind:string,body:string,recordVersion:number,at:string){
 return db.prepare('INSERT INTO lub_comments (id,story_id,kind,body,author_id,author_name,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM lub_records WHERE id=? AND version=? AND updated_at=?)')
  .bind(crypto.randomUUID(),storyId,kind,body,me.id,me.name,at,storyId,recordVersion,at);
}
