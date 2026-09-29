import { env } from 'cloudflare:workers';
import {seedIdeas,seedTasks} from './seeds';
export function database():D1Database{if(!env.DB)throw new Error('STORAGE_UNAVAILABLE');return env.DB;}
export async function initialize(db:D1Database){
 const initialized=await db.prepare('SELECT value FROM lub_meta WHERE key = ?').bind('initialized').first();if(initialized)return;
 const now=new Date().toISOString();const statements=[];
 seedIdeas.forEach((s,i)=>{const id='idea-'+i; const p={id,title:s[0],series:s[1],topic:s[2],format:s[3],angle:s[4],owner:'',status:'idea',priority:'عادية',due:'',plannedAt:'',script:'',sourceUrl:'',sourceNote:'فكرة تأسيسية مقترحة؛ تحتاج بحثًا وتوثيقًا قبل الإنتاج.',sourceVerified:false,rightsVerified:false,assetUrl:'',postUrl:'',history:[{at:now,message:'أُضيفت فكرة تأسيسية مقترحة'}]};statements.push(db.prepare('INSERT OR IGNORE INTO lub_records (id,kind,payload,version,updated_at) VALUES (?,?,?,1,?)').bind(id,'story',JSON.stringify(p),now));});
 seedTasks.forEach((s,i)=>{const id='launch-'+i;statements.push(db.prepare('INSERT OR IGNORE INTO lub_records (id,kind,payload,version,updated_at) VALUES (?,?,?,1,?)').bind(id,'task',JSON.stringify({id,title:s[0],phase:s[1],acceptance:s[2],owner:'',due:'',done:false}),now));});
 statements.push(db.prepare('INSERT OR IGNORE INTO lub_meta (key,value) VALUES (?,?)').bind('initialized',now));await db.batch(statements);
}
export async function workspace(db:D1Database){const {results}=await db.prepare('SELECT id,kind,payload,version,updated_at FROM lub_records ORDER BY updated_at DESC,id').all<{id:string;kind:string;payload:string;version:number;updated_at:string}>();const rows=results.map(r=>({...JSON.parse(r.payload),id:r.id,version:r.version,updatedAt:r.updated_at,kind:r.kind}));return {stories:rows.filter(r=>r.kind==='story'),tasks:rows.filter(r=>r.kind==='task'),members:rows.filter(r=>r.kind==='member'),updatedAt:new Date().toISOString()};}
