'use client';
import {useCallback,useEffect,useState} from 'react';
import {Loader2,History} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';

type Entry={id:string;at:string;actorId:string|null;actorName:string;action:string;entityKind:string;entityId:string|null;summary:string};
const groups:[string,string][]=[['all','كل النشاط'],['story','القصص'],['task','المهام'],['team','الفريق والحسابات'],['auth','الدخول والخروج']];
const actionGroup=(a:string)=>a.split('.')[0]==='member'?'team':a.split('.')[0];
const when=(v:string)=>new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short',calendar:'gregory',timeZone:'Asia/Riyadh'}).format(new Date(v));

export default function ActivityPanel({onExpired,onOpenStory}:{onExpired:()=>void;onOpenStory:(id:string)=>void}){
 const [entries,setEntries]=useState<Entry[]|null>(null),[more,setMore]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[group,setGroup]=useState('all');
 const fetchPage=useCallback(async(before?:string)=>{
  try{const r=await fetch('/api/activity?limit=50'+(before?'&before='+encodeURIComponent(before):''),{cache:'no-store'});const d:{error?:string;entries:Entry[];hasMore:boolean}=await r.json();if(r.status===401){onExpired();return;}if(!r.ok)throw Error(d.error);
   setEntries(e=>before&&e?[...e,...d.entries]:d.entries);setMore(d.hasMore);setError('');}
  catch(e){setError(e instanceof Error?e.message:'تعذر التحميل');}finally{setLoading(false);}
 },[onExpired]);
 useEffect(()=>{fetchPage()},[fetchPage]);
 const load=(before?:string)=>{setLoading(true);return fetchPage(before);};
 const shown=(entries||[]).filter(e=>group==='all'||actionGroup(e.action)===group);
 return <section>
  <div className="toolbar"><Select dir="rtl" value={group} onValueChange={setGroup}><SelectTrigger aria-label="نوع النشاط"><SelectValue/></SelectTrigger><SelectContent>{groups.map(([v,l])=><SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select><Button variant="outline" onClick={()=>load()} disabled={loading}>تحديث</Button></div>
  {error&&<div className="error-banner" role="alert">{error}<Button variant="outline" onClick={()=>load()}>إعادة المحاولة</Button></div>}
  {!entries&&loading&&<div className="panel auth-loading"><Loader2 className="spin" size={18}/>جارٍ تحميل السجل…</div>}
  {entries&&!shown.length&&<div className="empty-panel"><History size={28}/><h3>لا يوجد نشاط مسجل من هذا النوع</h3><p>يُسجّل كل تعديل واعتماد ونشر ودعوة مع اسم منفذه ووقته.</p></div>}
  {shown.length>0&&<ol className="panel activity-list">{shown.map(e=><li key={e.id}>
   <span className="history-dot"/>
   <div><strong>{e.summary}</strong><small><b>{e.actorName}</b> · {when(e.at)}</small></div>
   {e.entityKind==='story'&&e.entityId&&<button className="text-button" onClick={()=>onOpenStory(e.entityId!)}>فتح القصة</button>}
  </li>)}</ol>}
  {more&&<Button variant="outline" className="load-more" disabled={loading} onClick={()=>entries&&load(entries[entries.length-1].at)}>{loading?<Loader2 className="spin" size={16}/>:null}عرض أقدم</Button>}
 </section>;
}
