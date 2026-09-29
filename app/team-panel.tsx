'use client';
import {useCallback,useEffect,useState} from 'react';
import {UserPlus,Copy,Loader2,KeyRound,Ban,CheckCircle2,X,ShieldCheck} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {toast} from 'sonner';
import {can,roles,roleLabels,roleDescriptions,isRole,type Role} from '@/lib/roles';
import type {SessionUser} from '@/lib/auth';
import type {Member} from '@/lib/model';

type Account={id:string;name:string;role:string;status:string;email?:string;lastLoginAt?:string|null;createdAt?:string;version?:number;sitesLinked?:boolean};
type Reply={error?:string;link?:string;expiresAt?:string;team?:{users:Account[];invites:Invite[]};users?:Account[];invites?:Invite[]};
type Invite={id:string;email:string;name:string;role:string;memberId:string|null;expiresAt:string};
const when=(v?:string|null)=>v?new Intl.DateTimeFormat('ar-SA',{dateStyle:'medium',timeStyle:'short',calendar:'gregory',timeZone:'Asia/Riyadh'}).format(new Date(v)):'لم يسجّل الدخول بعد';
const roleName=(r:string)=>isRole(r)?roleLabels[r]:r;

function RolePicker({value,onChange,disabled,label}:{value:string;onChange:(r:Role)=>void;disabled?:boolean;label:string}){
 return <Select dir="rtl" value={value} onValueChange={v=>onChange(v as Role)} disabled={disabled}><SelectTrigger aria-label={label} className="w-full"><SelectValue/></SelectTrigger><SelectContent>{roles.map(r=><SelectItem key={r} value={r}>{roleLabels[r]}</SelectItem>)}</SelectContent></Select>;
}

export default function TeamPanel({me,members,onExpired}:{me:SessionUser;members:Member[];onExpired:()=>void}){
 const manage=can(me,'team.manage');
 const [users,setUsers]=useState<Account[]|null>(null),[invites,setInvites]=useState<Invite[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState('');
 const [inviteOpen,setInviteOpen]=useState(false),[draft,setDraft]=useState({email:'',name:'',role:'editor' as Role,memberId:''});
 const [shared,setShared]=useState<{title:string;link:string;expiresAt:string}|null>(null);
 const call=useCallback(async(body?:Record<string,unknown>)=>{
  const r=await fetch('/api/team',body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
  const d=await r.json().catch(()=>({error:'تعذر الاتصال بالخادم'})) as Reply;if(r.status===401){onExpired();throw Error(d.error);}if(!r.ok)throw Error(d.error||'تعذر إكمال الطلب');
  const t=d.team||d;if(t.users){setUsers(t.users);setInvites(t.invites||[]);}return d;
 },[onExpired]);
 const load=useCallback(async()=>{try{await call();setError('');}catch(e){setError(e instanceof Error?e.message:'تعذر التحميل');}},[call]);
 useEffect(()=>{load()},[load]);
 async function act(key:string,body:Record<string,unknown>,done?:string):Promise<Reply|undefined>{setBusy(key);try{const d=await call(body);if(done)toast.success(done);return d;}catch(e){toast.error(e instanceof Error?e.message:'تعذر الحفظ');}finally{setBusy('');}}
 async function sendInvite(){const d=await act('invite',{action:'invite',...draft},'أُنشئت الدعوة');if(d?.link){setInviteOpen(false);setShared({title:'رابط دعوة '+draft.email,link:d.link,expiresAt:d.expiresAt||''});setDraft({email:'',name:'',role:'editor',memberId:''});}}
 async function copy(text:string){try{await navigator.clipboard.writeText(text);toast.success('نُسخ الرابط');}catch{toast.error('تعذر النسخ؛ حدد الرابط وانسخه يدويًا');}}
 const linkedIds=new Set((users||[]).map(u=>u.id));
 const freeMembers=members.filter(m=>!linkedIds.has(m.id)&&!invites.some(i=>i.memberId===m.id));
 return <section className="team-accounts">
  <div className="section-heading"><div><h2><ShieldCheck size={18}/>حسابات الدخول</h2><p>{users?`الحسابات النشطة: ${users.filter(u=>u.status==='active').length}`:'…'} · الصلاحيات تُطبّق في الخادم على كل عملية.</p></div>
   {manage&&<Button onClick={()=>setInviteOpen(true)}><UserPlus size={16}/>دعوة عضو</Button>}</div>
  {error&&<div className="error-banner" role="alert">{error}<Button variant="outline" onClick={load}>إعادة المحاولة</Button></div>}
  {!users&&!error&&<div className="panel auth-loading"><Loader2 className="spin" size={18}/>جارٍ تحميل الحسابات…</div>}
  {users&&<div className="account-list">{users.map(u=>{const self=u.id===me.id;return <div className={'panel account-row'+(u.status!=='active'?' is-disabled':'')} key={u.id}>
   <span className="member-avatar">{u.name.slice(0,1)}</span>
   <div className="account-main"><strong>{u.name}{self&&<small className="you-tag">أنت</small>}</strong><small dir="ltr">{u.email||''}</small><small>{u.status==='active'?'نشط':'معطل'}{u.lastLoginAt!==undefined?' · آخر دخول: '+when(u.lastLoginAt):''}{u.sitesLinked?' · مرتبط بهوية Sites':''}</small></div>
   <div className="account-role">{manage&&!self?<RolePicker label={'دور '+u.name} value={u.role} disabled={!!busy} onChange={role=>act('role'+u.id,{action:'updateUser',id:u.id,version:u.version,role},'تغيّر الدور؛ انتهت جلسات العضو الحالية')}/>:<span className="status">{roleName(u.role)}</span>}</div>
   {manage&&!self&&<div className="account-actions">
    {u.status==='active'&&<Button variant="outline" size="sm" disabled={!!busy} onClick={async()=>{const d=await act('reset'+u.id,{action:'resetLink',id:u.id});if(d?.link)setShared({title:'رابط استعادة وصول '+u.name,link:d.link,expiresAt:d.expiresAt||''});}}><KeyRound size={15}/>رابط استعادة</Button>}
    {u.status==='active'?<Button variant="ghost" size="sm" disabled={!!busy} onClick={()=>{if(confirm(`تعطيل حساب ${u.name}؟ ستنتهي جلساته فورًا ولن يستطيع الدخول.`))act('status'+u.id,{action:'updateUser',id:u.id,version:u.version,status:'disabled'},'عُطّل الحساب');}}><Ban size={15}/>تعطيل</Button>
     :<Button variant="outline" size="sm" disabled={!!busy} onClick={()=>act('status'+u.id,{action:'updateUser',id:u.id,version:u.version,status:'active'},'فُعّل الحساب')}><CheckCircle2 size={15}/>تفعيل</Button>}
   </div>}
  </div>;})}</div>}
  {manage&&invites.length>0&&<div className="panel invite-list"><h3>دعوات بانتظار القبول</h3>{invites.map(i=><div key={i.id} className="invite-row"><div><strong dir="ltr">{i.email}</strong><small>{roleName(i.role)} · تنتهي {when(i.expiresAt)}</small></div><Button variant="ghost" size="sm" disabled={!!busy} onClick={()=>act('revoke'+i.id,{action:'revokeInvite',id:i.id},'أُلغيت الدعوة')}><X size={15}/>إلغاء</Button></div>)}</div>}
  <details className="panel role-guide"><summary>ماذا يستطيع كل دور؟</summary><dl>{roles.map(r=><div key={r}><dt>{roleLabels[r]}</dt><dd>{roleDescriptions[r]}</dd></div>)}</dl></details>
  <Dialog open={inviteOpen} onOpenChange={setInviteOpen}><DialogContent dir="rtl"><DialogHeader><DialogTitle>دعوة عضو إلى لُب</DialogTitle><DialogDescription>يُنشأ رابط لمرة واحدة صالح 7 أيام. لا يُرسل بريد تلقائيًا؛ انسخ الرابط وأرسله للعضو بقناة موثوقة.</DialogDescription></DialogHeader>
   <label className="field"><span>البريد الإلكتروني</span><Input type="email" dir="ltr" value={draft.email} onChange={e=>setDraft({...draft,email:e.target.value})}/></label>
   <label className="field"><span>الاسم المقترح (اختياري)</span><Input value={draft.name} maxLength={80} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
   <div className="field"><span>الدور</span><RolePicker label="الدور" value={draft.role} onChange={role=>setDraft({...draft,role})}/><small className="muted">{roleDescriptions[draft.role]}</small></div>
   {freeMembers.length>0&&<div className="field"><span>ربط بعضو إسناد قائم (اختياري)</span><Select dir="rtl" value={draft.memberId||'_none'} onValueChange={v=>setDraft({...draft,memberId:v==='_none'?'':v})}><SelectTrigger aria-label="عضو الإسناد" className="w-full"><SelectValue/></SelectTrigger><SelectContent><SelectItem value="_none">دون ربط</SelectItem>{freeMembers.map(m=><SelectItem key={m.id} value={m.id}>{m.name} · {m.role}</SelectItem>)}</SelectContent></Select><small className="muted">يرث الحساب القصص والمهام المسندة إلى هذا العضو.</small></div>}
   <Button disabled={busy==='invite'||!/^\S+@\S+\.\S+$/.test(draft.email)} onClick={sendInvite}>{busy==='invite'?<Loader2 className="spin" size={16}/>:<UserPlus size={16}/>}إنشاء رابط الدعوة</Button>
  </DialogContent></Dialog>
  <Dialog open={!!shared} onOpenChange={o=>{if(!o)setShared(null)}}><DialogContent dir="rtl"><DialogHeader><DialogTitle>{shared?.title}</DialogTitle><DialogDescription>يظهر الرابط هذه المرة فقط، ويصلح لاستخدام واحد حتى {when(shared?.expiresAt)}. من يملك الرابط يستطيع استخدامه، فأرسله للشخص المعني وحده.</DialogDescription></DialogHeader>
   <Input dir="ltr" readOnly value={shared?.link||''} onFocus={e=>e.currentTarget.select()} aria-label="الرابط"/>
   <Button onClick={()=>shared&&copy(shared.link)}><Copy size={16}/>نسخ الرابط</Button>
  </DialogContent></Dialog>
 </section>;
}
