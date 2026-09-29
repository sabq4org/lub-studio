'use client';
import {useCallback,useEffect,useState} from 'react';
import {Plus,Trash2,ExternalLink,Loader2,MessageSquare,Gavel,Check,ShieldCheck,ChevronDown} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Checkbox} from '@/components/ui/checkbox';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {toast} from 'sonner';
import {sourceKinds,sourceKindLabels,claimKinds,claimKindLabels,outputFormats,outputFormatLabels,checklistItems,X_LIMIT,styleHints,type Source,type Claim,type Output,type ChecklistKey} from '@/lib/model';

const newId=(p:string)=>p+Math.random().toString(36).slice(2,10);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(new Date());
const when=(v:string)=>new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short',calendar:'gregory',timeZone:'Asia/Riyadh'}).format(new Date(v));
function Pick<T extends string>({value,options,labels,onChange,label,disabled}:{value:T;options:readonly T[];labels:Record<T,string>;onChange:(v:T)=>void;label:string;disabled?:boolean}){
 return <Select dir="rtl" value={value} onValueChange={v=>onChange(v as T)} disabled={disabled}><SelectTrigger aria-label={label} className="w-full"><SelectValue/></SelectTrigger><SelectContent>{options.map(o=><SelectItem key={o} value={o}>{labels[o]}</SelectItem>)}</SelectContent></Select>;
}
const sourceName=(s:Source,i:number)=>s.publisher||s.title||`مصدر ${i+1}`;

export function SourcesEditor({sources,claims,onChange,disabled,saudi}:{sources:Source[];claims:Claim[];onChange:(sources:Source[],claims:Claim[])=>void;disabled:boolean;saudi:boolean}){
 const set=(i:number,patch:Partial<Source>)=>onChange(sources.map((s,j)=>j===i?{...s,...patch}:s),claims);
 const remove=(i:number)=>{const id=sources[i].id;const used=claims.filter(c=>c.sourceIds.includes(id)).length;if(used&&!confirm(`هذا المصدر مربوط بـ ${used} من الادعاءات. حذفه يفك الربط. متابعة؟`))return;onChange(sources.filter((_,j)=>j!==i),claims.map(c=>({...c,sourceIds:c.sourceIds.filter(x=>x!==id)})));};
 return <section className="editor-block" aria-label="المصادر">
  <div className="block-heading"><h3>المصادر</h3>{!disabled&&<Button variant="outline" size="sm" onClick={()=>onChange([...sources,{id:newId('s'),url:'',publisher:'',title:'',publishedAt:'',accessedAt:today(),kind:saudi?'official_sa':'official'}],claims)}><Plus size={15}/>إضافة مصدر</Button>}</div>
  {saudi&&<p className="muted">موضوع سعودي: يلزم مصدر واحد على الأقل من جهة سعودية رسمية، ويُقدَّم على غيره.</p>}
  {!sources.length&&<p className="empty-line">لا توجد مصادر بعد. أضف الرابط والجهة وتاريخ النشر وتاريخ الاطلاع.</p>}
  {sources.map((s,i)=><div className="item-card" key={s.id}>
   <div className="item-head"><strong>{sourceName(s,i)}</strong>{s.url&&/^https?:\/\//.test(s.url)&&<a href={s.url} target="_blank" rel="noreferrer noopener" className="text-button"><ExternalLink size={14}/>فتح</a>}{!disabled&&<Button variant="ghost" size="icon" aria-label={'حذف '+sourceName(s,i)} onClick={()=>remove(i)}><Trash2 size={15}/></Button>}</div>
   <label className="field"><span>الرابط</span><Input dir="ltr" type="url" placeholder="https://" value={s.url} disabled={disabled} onChange={e=>set(i,{url:e.target.value})}/></label>
   <div className="form-grid">
    <label className="field"><span>الجهة</span><Input value={s.publisher} disabled={disabled} maxLength={200} onChange={e=>set(i,{publisher:e.target.value})}/></label>
    <div className="field"><span>نوع المصدر</span><Pick label="نوع المصدر" value={s.kind} options={sourceKinds} labels={sourceKindLabels} disabled={disabled} onChange={kind=>set(i,{kind})}/></div>
    <label className="field"><span>تاريخ النشر</span><Input type="date" value={s.publishedAt} disabled={disabled} onChange={e=>set(i,{publishedAt:e.target.value})}/></label>
    <label className="field"><span>تاريخ الاطلاع</span><Input type="date" value={s.accessedAt} disabled={disabled} onChange={e=>set(i,{accessedAt:e.target.value})}/></label>
   </div>
   <label className="field"><span>عنوان الوثيقة (اختياري)</span><Input value={s.title} disabled={disabled} maxLength={300} onChange={e=>set(i,{title:e.target.value})}/></label>
  </div>)}
 </section>;
}

export function ClaimsEditor({sources,claims,onChange,disabled}:{sources:Source[];claims:Claim[];onChange:(claims:Claim[])=>void;disabled:boolean}){
 const set=(i:number,patch:Partial<Claim>)=>onChange(claims.map((c,j)=>j===i?{...c,...patch}:c));
 return <section className="editor-block" aria-label="الأرقام والادعاءات">
  <div className="block-heading"><h3>الأرقام والادعاءات</h3>{!disabled&&<Button variant="outline" size="sm" onClick={()=>onChange([...claims,{id:newId('c'),text:'',figure:'',kind:'fact',sourceIds:[],verified:false}])}><Plus size={15}/>إضافة ادعاء</Button>}</div>
  <p className="muted">كل حقيقة أو تقدير يُربط بمصدره. الاستنتاج التحريري يُعلن بوصفه استنتاجًا.</p>
  {!claims.length&&<p className="empty-line">لا توجد أرقام أو ادعاءات مسجلة.</p>}
  {claims.map((c,i)=>{const unlinked=c.kind!=='inference'&&!c.sourceIds.length;return <div className={'item-card'+(unlinked?' needs-attention':'')} key={c.id}>
   <div className="item-head"><strong>{c.figure||`ادعاء ${i+1}`}</strong><span className={'status claim-'+c.kind}>{claimKindLabels[c.kind]}</span>{!disabled&&<Button variant="ghost" size="icon" aria-label="حذف الادعاء" onClick={()=>onChange(claims.filter((_,j)=>j!==i))}><Trash2 size={15}/></Button>}</div>
   <label className="field"><span>النص كما سيظهر</span><Textarea rows={2} value={c.text} disabled={disabled} maxLength={1000} onChange={e=>set(i,{text:e.target.value})}/></label>
   <div className="form-grid">
    <label className="field"><span>الرقم والوحدة</span><Input value={c.figure} disabled={disabled} maxLength={120} placeholder="مثال: 5.2% على أساس سنوي" onChange={e=>set(i,{figure:e.target.value})}/></label>
    <div className="field"><span>التصنيف</span><Pick label="تصنيف الادعاء" value={c.kind} options={claimKinds} labels={claimKindLabels} disabled={disabled} onChange={kind=>set(i,{kind,verified:kind==='fact'?c.verified:false})}/></div>
   </div>
   {c.kind!=='inference'&&<fieldset className="source-links" disabled={disabled}><legend>المصادر الداعمة</legend>{sources.length?sources.map((s,j)=><label key={s.id} className="check-field"><Checkbox checked={c.sourceIds.includes(s.id)} disabled={disabled} onCheckedChange={v=>set(i,{sourceIds:v?[...c.sourceIds,s.id]:c.sourceIds.filter(x=>x!==s.id)})}/>{sourceName(s,j)}</label>):<small className="muted">أضف مصدرًا أولًا.</small>}</fieldset>}
   {c.kind==='fact'&&<label className="check-field"><Checkbox checked={c.verified} disabled={disabled} onCheckedChange={v=>set(i,{verified:!!v})}/>طابقت الرقم مع المصدر (الوحدة والفترة والتعريف)</label>}
   {unlinked&&<small className="warn-text">يحتاج مصدرًا قبل المراجعة.</small>}
  </div>;})}
 </section>;
}

export function OutputsEditor({outputs,onChange,disabled}:{outputs:Output[];onChange:(o:Output[])=>void;disabled:boolean}){
 const set=(i:number,patch:Partial<Output>)=>onChange(outputs.map((o,j)=>j===i?{...o,...patch}:o));
 return <section className="editor-block" aria-label="مخرجات المنصات">
  <div className="block-heading"><h3>مخرجات المنصات</h3>{!disabled&&<Button variant="outline" size="sm" onClick={()=>onChange([...outputs,{id:newId('o'),platform:'x',format:'post',parts:[''],assetUrl:''}])}><Plus size={15}/>مخرج لـ X</Button>}</div>
  <p className="muted">النص الذي سيُنشر فعلًا. X هي المنصة الأولى؛ النشر من لُب غير مربوط بعد، وهذه المعاينة للمراجعة والاعتماد.</p>
  {!outputs.length&&<p className="empty-line">لا توجد مخرجات. أضف منشورًا أو سلسلة.</p>}
  {outputs.map((o,i)=><div className="item-card" key={o.id}>
   <div className="item-head"><strong><span className="x-mark small-x">𝕏</span>{outputFormatLabels[o.format]}</strong>{!disabled&&<Button variant="ghost" size="icon" aria-label="حذف المخرج" onClick={()=>onChange(outputs.filter((_,j)=>j!==i))}><Trash2 size={15}/></Button>}</div>
   <div className="field"><span>الشكل</span><Pick label="شكل المخرج" value={o.format} options={outputFormats} labels={outputFormatLabels} disabled={disabled} onChange={format=>set(i,{format,parts:format==='thread'?o.parts:[o.parts[0]||'']})}/></div>
   {o.parts.map((p,k)=><label className="field" key={k}><span>{o.format==='thread'?`المنشور ${k+1} من ${o.parts.length}`:'نص المنشور'}<small className={p.length>X_LIMIT?'warn-text':'muted'}> · {p.length}/{X_LIMIT}</small></span>
    <Textarea rows={3} value={p} disabled={disabled} onChange={e=>set(i,{parts:o.parts.map((x,m)=>m===k?e.target.value:x)})}/>
    {o.format==='thread'&&o.parts.length>1&&!disabled&&<button type="button" className="text-button" onClick={()=>set(i,{parts:o.parts.filter((_,m)=>m!==k)})}>حذف هذا الجزء</button>}
   </label>)}
   {o.format==='thread'&&!disabled&&o.parts.length<25&&<Button variant="ghost" size="sm" onClick={()=>set(i,{parts:[...o.parts,'']})}><Plus size={15}/>جزء جديد في السلسلة</Button>}
   <label className="field"><span>رابط الوسيط المرافق (اختياري)</span><Input dir="ltr" type="url" placeholder="https://" value={o.assetUrl} disabled={disabled} onChange={e=>set(i,{assetUrl:e.target.value})}/></label>
   <div className="x-preview" aria-label="معاينة">{o.parts.filter(x=>x.trim()).map((x,k)=><p key={k}>{x}</p>)}{!o.parts.some(x=>x.trim())&&<small className="muted">تظهر المعاينة هنا.</small>}</div>{(()=>{const h=styleHints(o.parts);return h.length>0&&<ul className="brand-hints" aria-label="ملاحظات دليل الأسلوب">{h.map(x=><li key={x}>{x}</li>)}</ul>})()}
  </div>)}
 </section>;
}

export function ReviewChecklist({value,editable,busy,onChange,by,at}:{value:Partial<Record<ChecklistKey,boolean>>;editable:boolean;busy:boolean;onChange:(v:Record<string,boolean>)=>void;by?:string;at?:string}){
 const done=checklistItems.filter(([k])=>value[k]).length;
 return <section className="editor-block" aria-label="قائمة تحقق المراجعة">
  <div className="block-heading"><h3><ShieldCheck size={17}/>قائمة تحقق المراجعة</h3><span className="count-badge">{done}/{checklistItems.length}</span></div>
  {!editable&&<p className="muted">يعدّلها مراجع القصة أو مدير التحرير أثناء المراجعة. أي تعديل على المحتوى يعيدها فارغة.</p>}
  {checklistItems.map(([k,label])=><label className="check-field" key={k}><Checkbox checked={!!value[k]} disabled={!editable||busy} onCheckedChange={v=>onChange({...Object.fromEntries(checklistItems.map(([x])=>[x,!!value[x]])),[k]:!!v})}/>{label}</label>)}
  {by&&at&&<small className="muted">آخر تحديث: {by} · {when(at)}</small>}
 </section>;
}

type Comment={id:string;kind:string;body:string;authorId:string|null;authorName:string;createdAt:string;resolvedAt:string|null;resolvedBy:string|null};
type Version={id:string;n:number;hash:string;content:Record<string,unknown>;reason:string;actorName:string;at:string;approved:boolean};
function useStoryDetail(storyId:string,revision:number,onExpired:()=>void){
 const [data,setData]=useState<{comments:Comment[];versions:Version[]}|null>(null),[error,setError]=useState('');
 const load=useCallback(async()=>{try{const r=await fetch('/api/story?id='+encodeURIComponent(storyId),{cache:'no-store'});const d:{error?:string;comments:Comment[];versions:Version[]}=await r.json();if(r.status===401){onExpired();return;}if(!r.ok)throw Error(d.error);setData(d);setError('');}catch(e){setError(e instanceof Error?e.message:'تعذر التحميل');}},[storyId,onExpired]);
 useEffect(()=>{load()},[load,revision]);
 return {data,error,load};
}
export function StoryDiscussion({storyId,revision,canWrite,canDecide,canResolve,onExpired}:{storyId:string;revision:number;canWrite:boolean;canDecide:boolean;canResolve:(c:{authorId:string|null})=>boolean;onExpired:()=>void}){
 const {data,error,load}=useStoryDetail(storyId,revision,onExpired);const [body,setBody]=useState(''),[busy,setBusy]=useState(false);
 async function post(payload:Record<string,unknown>,done:string){setBusy(true);try{const r=await fetch('/api/story',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d:{error?:string}=await r.json();if(r.status===401){onExpired();return;}if(!r.ok)throw Error(d.error);toast.success(done);await load();return true;}catch(e){toast.error(e instanceof Error?e.message:'تعذر الحفظ');}finally{setBusy(false);}}
 const labels:Record<string,string>={comment:'تعليق',review_note:'ملاحظة مراجعة',decision:'قرار تحريري'};
 return <div className="editor-fields">
  {canWrite&&<div className="comment-box"><Textarea rows={3} value={body} maxLength={4000} onChange={e=>setBody(e.target.value)} placeholder="ملاحظة للفريق، أو سبب قرار…" aria-label="تعليق جديد"/>
   <div className="workflow-actions"><Button disabled={busy||!body.trim()} onClick={async()=>{if(await post({action:'comment',storyId,body},'أُضيف التعليق'))setBody('');}}>{busy?<Loader2 className="spin" size={16}/>:<MessageSquare size={16}/>}إضافة تعليق</Button>
   {canDecide&&<Button variant="outline" disabled={busy||!body.trim()} onClick={async()=>{if(await post({action:'comment',storyId,body,kind:'decision'},'سُجّل القرار'))setBody('');}}><Gavel size={16}/>تسجيل كقرار</Button>}</div></div>}
  {error&&<div className="error-banner" role="alert">{error}<Button variant="outline" onClick={load}>إعادة المحاولة</Button></div>}
  {!data&&!error&&<div className="auth-loading"><Loader2 className="spin" size={18}/>جارٍ التحميل…</div>}
  {data&&!data.comments.length&&<p className="empty-line">لا توجد تعليقات أو قرارات بعد.</p>}
  {data?.comments.map(c=><article key={c.id} className={'comment kind-'+c.kind+(c.resolvedAt?' is-resolved':'')}>
   <header><strong>{c.authorName}</strong><span className="status">{labels[c.kind]||c.kind}</span><small>{when(c.createdAt)}</small></header>
   <p>{c.body}</p>
   {c.resolvedAt?<small className="muted"><Check size={13}/>أُغلقت بواسطة {c.resolvedBy}</small>:c.kind!=='decision'&&canResolve(c)&&<button className="text-button" disabled={busy} onClick={()=>post({action:'resolve',id:c.id},'أُغلقت الملاحظة')}>إغلاق الملاحظة</button>}
  </article>)}
 </div>;
}
export function StoryVersions({storyId,revision,onExpired}:{storyId:string;revision:number;onExpired:()=>void}){
 const {data,error,load}=useStoryDetail(storyId,revision,onExpired);const [open,setOpen]=useState<number|null>(null);
 return <section className="editor-block" aria-label="إصدارات المحتوى">
  <h3>إصدارات المحتوى</h3><p className="muted">كل حفظ يغيّر المحتوى القابل للمراجعة ينشئ إصدارًا ثابتًا. الاعتماد يشير إلى إصدار بعينه.</p>
  {error&&<div className="error-banner" role="alert">{error}<Button variant="outline" onClick={load}>إعادة المحاولة</Button></div>}
  {data&&!data.versions.length&&<p className="empty-line">لا توجد إصدارات محفوظة لهذه القصة بعد؛ يُنشأ أول إصدار عند الحفظ التالي أو عند الاعتماد.</p>}
  {data?.versions.map(v=><div key={v.id} className="version-row">
   <button type="button" onClick={()=>setOpen(open===v.n?null:v.n)} aria-expanded={open===v.n}><b>الإصدار {v.n}</b>{v.approved&&<span className="status status-approved">المعتمد</span>}<small>{v.reason} · {v.actorName} · {when(v.at)}</small><ChevronDown size={15}/></button>
   {open===v.n&&<div className="version-body"><h4>{String(v.content.title||'')}</h4><pre>{String(v.content.script||'')}</pre>
    {Array.isArray(v.content.outputs)&&(v.content.outputs as Output[]).map(o=><div key={o.id} className="x-preview">{o.parts.map((p,k)=><p key={k}>{p}</p>)}</div>)}
    <small className="muted" dir="ltr">sha256 {v.hash.slice(0,16)}…</small></div>}
  </div>)}
 </section>;
}
