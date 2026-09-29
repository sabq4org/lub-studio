import { env } from 'cloudflare:workers';
import {isRole,type Actor,type Role} from './roles';

export type UserRow={id:string;email:string;name:string;role:string;status:string;password_hash:string|null;sites_user_id:string|null;created_at:string;updated_at:string;last_login_at:string|null;version:number};
export type SessionUser=Actor&{email:string;status:string;version:number};
export const SESSION_COOKIE='lub_session';
const SESSION_DAYS=14,PBKDF2_ITERATIONS=100000,MAX_ATTEMPTS=8,ATTEMPT_WINDOW_MS=15*60*1000;
const enc=new TextEncoder();

// Identity headers are only trusted when the deployment explicitly runs behind Sites, whose dispatch layer injects them.
export function authMode():'sites'|'local'{return (env as {LUB_AUTH_MODE?:string}).LUB_AUTH_MODE==='sites'?'sites':'local';}
export function setupToken():string{return ((env as {LUB_SETUP_TOKEN?:string}).LUB_SETUP_TOKEN||'').trim();}

const b64=(bytes:ArrayBuffer|Uint8Array)=>btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64=(s:string):Uint8Array<ArrayBuffer>=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
export function randomToken(){const b=crypto.getRandomValues(new Uint8Array(32));return b64(b).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
export async function sha256(s:string){return b64(await crypto.subtle.digest('SHA-256',enc.encode(s)));}
function sameBytes(a:Uint8Array,b:Uint8Array){if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a[i]^b[i];return d===0;}
export async function safeEqual(a:string,b:string){return sameBytes(unb64(await sha256(a)),unb64(await sha256(b)));}

async function pbkdf2(password:string,salt:Uint8Array<ArrayBuffer>,iterations:number){
 const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);
 return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations},key,256));
}
export async function hashPassword(password:string){const salt=crypto.getRandomValues(new Uint8Array(16));return `pbkdf2$${PBKDF2_ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(password,salt,PBKDF2_ITERATIONS))}`;}
export async function verifyPassword(password:string,stored:string|null){
 const [scheme,iter,salt,hash]=(stored||'').split('$');if(scheme!=='pbkdf2'||!salt||!hash)return false;
 return sameBytes(await pbkdf2(password,unb64(salt),Number(iter)),unb64(hash));
}
export function passwordProblem(p:unknown){if(typeof p!=='string'||p.length<10)return 'كلمة المرور يجب ألا تقل عن 10 أحرف';if(p.length>200)return 'كلمة المرور طويلة جدًا';return '';}

function cookies(req:Request){const out:Record<string,string>={};for(const part of (req.headers.get('cookie')||'').split(';')){const i=part.indexOf('=');if(i>0)out[part.slice(0,i).trim()]=part.slice(i+1).trim();}return out;}
const secure=(req:Request)=>new URL(req.url).protocol==='https:'?'; Secure':'';
export function sessionCookie(req:Request,token:string){return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS*86400}${secure(req)}`;}
export function clearedCookie(req:Request){return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure(req)}`;}

export function toSessionUser(u:UserRow):SessionUser{return {id:u.id,name:u.name,email:u.email,role:(isRole(u.role)?u.role:'viewer') as Role,status:u.status,version:u.version};}

export async function createSession(db:D1Database,userId:string){
 const token=randomToken(),now=new Date(),expires=new Date(now.getTime()+SESSION_DAYS*86400000).toISOString();
 await db.batch([
  db.prepare('INSERT INTO lub_sessions (id,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)').bind(await sha256(token),userId,now.toISOString(),expires,now.toISOString()),
  db.prepare('UPDATE lub_users SET last_login_at=? WHERE id=?').bind(now.toISOString(),userId),
  db.prepare('DELETE FROM lub_sessions WHERE expires_at<?').bind(now.toISOString())
 ]);
 return token;
}
export async function endSession(db:D1Database,req:Request){const t=cookies(req)[SESSION_COOKIE];if(t)await db.prepare('DELETE FROM lub_sessions WHERE id=?').bind(await sha256(t)).run();}

// Trusted Sites identity, or null when not running in Sites mode.
export function sitesIdentity(req:Request){
 if(authMode()!=='sites')return null;
 const userId=req.headers.get('oai-authenticated-user-id'),email=req.headers.get('oai-authenticated-user-email');if(!userId||!email)return null;
 let name:string|null=null;const encoded=req.headers.get('oai-authenticated-user-full-name');
 if(encoded&&req.headers.get('oai-authenticated-user-full-name-encoding')==='percent-encoded-utf-8'){try{name=decodeURIComponent(encoded);}catch{name=null;}}
 return {userId,email:email.toLowerCase(),name};
}

export async function currentUser(db:D1Database,req:Request):Promise<SessionUser|null>{
 const now=new Date().toISOString(),token=cookies(req)[SESSION_COOKIE];
 if(token&&token.length<200){
  const id=await sha256(token);
  const row=await db.prepare('SELECT u.*,s.last_seen_at AS seen FROM lub_sessions s JOIN lub_users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>?').bind(id,now).first<UserRow&{seen:string}>();
  if(row&&row.status==='active'){
   if(Date.now()-Date.parse(row.seen)>3600000)await db.prepare('UPDATE lub_sessions SET last_seen_at=? WHERE id=?').bind(now,id).run();
   return toSessionUser(row);
  }
 }
 const sites=sitesIdentity(req);
 if(sites){const row=await db.prepare('SELECT * FROM lub_users WHERE sites_user_id=?').bind(sites.userId).first<UserRow>();if(row&&row.status==='active')return toSessionUser(row);}
 return null;
}

export async function userCount(db:D1Database){return (await db.prepare('SELECT COUNT(*) AS n FROM lub_users').first<{n:number}>())?.n||0;}

// Failed-login throttle per key (e-mail). Returns false while the key is locked.
export async function attemptAllowed(db:D1Database,key:string){
 const row=await db.prepare('SELECT count,window_start FROM lub_login_attempts WHERE key=?').bind(key).first<{count:number;window_start:string}>();
 return !row||row.count<MAX_ATTEMPTS||Date.now()-Date.parse(row.window_start)>ATTEMPT_WINDOW_MS;
}
export async function recordFailure(db:D1Database,key:string){
 const now=new Date().toISOString(),cutoff=new Date(Date.now()-ATTEMPT_WINDOW_MS).toISOString();
 await db.prepare('INSERT INTO lub_login_attempts (key,count,window_start) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window_start<? THEN 1 ELSE count+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END').bind(key,now,cutoff,cutoff).run();
}
export async function clearFailures(db:D1Database,key:string){await db.prepare('DELETE FROM lub_login_attempts WHERE key=?').bind(key).run();}

export type ActivityActor={id:string|null;name:string};
export function activity(db:D1Database,actor:ActivityActor,action:string,entityKind:string,entityId:string|null,summary:string,details?:unknown){
 return db.prepare('INSERT INTO lub_activity (id,at,actor_id,actor_name,action,entity_kind,entity_id,summary,details) VALUES (?,?,?,?,?,?,?,?,?)')
  .bind(crypto.randomUUID(),new Date().toISOString(),actor.id,actor.name,action,entityKind,entityId,summary,details===undefined?null:JSON.stringify(details));
}

export function json(body:unknown,status=200,headers:Record<string,string>={}){return Response.json(body,{status,headers:{'Cache-Control':'no-store',...headers}});}
export function fail(message:string,status=400){return json({error:message},status);}
export const unauthorized=()=>fail('انتهت الجلسة أو لم تسجّل الدخول. سجّل الدخول ثم أعد المحاولة.',401);
export const forbidden=(why='لا تملك صلاحية تنفيذ هذا الإجراء.')=>fail(why,403);
// Rejects cross-site and oversized writes before any parsing.
export async function readBody(req:Request,limit=100000):Promise<{body:Record<string,unknown>}|{error:Response}>{
 const site=req.headers.get('sec-fetch-site');if(site==='cross-site')return {error:fail('طلب غير مسموح',403)};
 const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)return {error:fail('طلب غير مسموح',403)};
 if(Number(req.headers.get('content-length')||0)>limit)return {error:fail('حجم الطلب كبير',413)};
 const raw=await req.text();if(raw.length>limit)return {error:fail('حجم الطلب كبير',413)};
 try{const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))return {error:fail('صيغة الطلب غير صالحة')};return {body:b};}catch{return {error:fail('صيغة الطلب غير صالحة')};}
}
