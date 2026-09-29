'use client';
import {useCallback,useEffect,useState} from 'react';
import {Loader2,LogIn,KeyRound,UserPlus,ShieldCheck,AlertCircle} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Toaster} from 'sonner';
import {roleLabels,isRole} from '@/lib/roles';
import type {SessionUser} from '@/lib/auth';
import Studio from './studio';

type Status={mode:'sites'|'local';user:SessionUser|null;setupRequired:boolean;setupConfigured:boolean;sites:{email:string;name:string|null}|null};
type Screen='login'|'setup'|'invite'|'reset'|'recover';
type TokenInfo={email:string;name:string;role:string;expiresAt:string};

type Reply={error?:string;user:SessionUser}&Partial<TokenInfo>;
async function post(body:Record<string,unknown>):Promise<Reply>{
 const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const d=await r.json().catch(()=>({error:'تعذر الاتصال بالخادم'})) as Reply;if(!r.ok)throw Error(d.error||'تعذر إكمال الطلب');return d;
}
// Tokens travel in the URL fragment so they never reach server logs; read once, then drop from the address bar.
function readHash():{kind:'invite'|'reset';token:string}|null{
 if(typeof window==='undefined')return null;const m=window.location.hash.match(/^#(invite|reset)=([A-Za-z0-9_-]{20,200})$/);
 return m?{kind:m[1] as 'invite'|'reset',token:m[2]}:null;
}
function Field({label,children,hint}:{label:string;children:React.ReactNode;hint?:string}){return <label className="field"><span>{label}</span>{children}{hint&&<small className="muted">{hint}</small>}</label>;}

export default function AuthGate(){
 const [status,setStatus]=useState<Status|null>(null),[loadError,setLoadError]=useState('');
 const [screen,setScreen]=useState<Screen>('login'),[link,setLink]=useState<{kind:'invite'|'reset';token:string}|null>(null),[info,setInfo]=useState<TokenInfo|null>(null);
 const [form,setForm]=useState({name:'',email:'',password:'',confirm:'',setupToken:''}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const load=useCallback(async()=>{
  try{const r=await fetch('/api/auth',{cache:'no-store'});setLoadError('');const d:Status&{error?:string}=await r.json();if(!r.ok)throw Error(d.error);setStatus(d);
   const h=readHash();
   if(h){setLink(h);setScreen(h.kind);try{const t=await post({action:'inspectToken',kind:h.kind,token:h.token}) as unknown as TokenInfo;setInfo(t);setForm(f=>({...f,name:t.name||f.name}));}catch(e){setError(e instanceof Error?e.message:'الرابط غير صالح');}}
   else if(d.setupRequired){setScreen('setup');const sites=d.sites;if(sites)setForm(f=>({...f,email:sites.email,name:sites.name||''}));}
  }catch(e){setLoadError(e instanceof Error?e.message:'تعذر التحميل');}
 },[]);
 useEffect(()=>{load()},[load]);
 const set=(k:keyof typeof form)=>(e:React.ChangeEvent<HTMLInputElement>)=>setForm({...form,[k]:e.target.value});
 const signedIn=(user:SessionUser)=>{if(link)history.replaceState(null,'',window.location.pathname+window.location.search);setLink(null);setForm({name:'',email:'',password:'',confirm:'',setupToken:''});setStatus(s=>s?{...s,user,setupRequired:false}:s);};
 async function submit(e:React.FormEvent){
  e.preventDefault();setError('');
  if(screen!=='login'&&form.password!==form.confirm){setError('تأكيد كلمة المرور لا يطابقها');return;}
  setBusy(true);
  try{
   const body=screen==='login'?{action:'login',email:form.email,password:form.password}:
    screen==='setup'?{action:'setup',name:form.name,email:form.email,password:form.password,setupToken:form.setupToken}:
    screen==='invite'?{action:'acceptInvite',token:link?.token,name:form.name,password:form.password}:
    screen==='reset'?{action:'resetPassword',token:link?.token,password:form.password}:
    {action:'recoverOwner',email:form.email,password:form.password,setupToken:form.setupToken};
   const d=await post(body);signedIn(d.user);
  }catch(err){setError(err instanceof Error?err.message:'تعذر إكمال الطلب');}finally{setBusy(false);}
 }
 const expired=useCallback(()=>{setStatus(s=>s?{...s,user:null}:s);setScreen('login');setError('انتهت الجلسة. سجّل الدخول مرة أخرى.');},[]);
 async function signOut(){try{await post({action:'logout'});}catch{}setStatus(s=>s?{...s,user:null}:s);setScreen('login');}

 if(status?.user)return <Studio me={status.user} onSignOut={signOut} onExpired={expired}/>;
 const titles:Record<Screen,[string,string]>={
  login:['الدخول إلى لُب','استخدم البريد وكلمة المرور التي أنشأتها عند قبول الدعوة.'],
  setup:['تهيئة مساحة لُب',status?.mode==='sites'?'لا توجد حسابات بعد. أنشئ حساب المالك المرتبط بهويتك في Sites.':'لا توجد حسابات بعد. أنشئ حساب المالك باستخدام رمز التهيئة المضبوط في أسرار الخادم.'],
  invite:['قبول الدعوة',info?`دعوة للبريد ${info.email} بدور ${isRole(info.role)?roleLabels[info.role]:info.role}.`:'تحقق من رابط الدعوة…'],
  reset:['تعيين كلمة مرور جديدة',info?`للحساب ${info.email}. ستنتهي جلساتك الأخرى.`:'تحقق من رابط الاستعادة…'],
  recover:['استعادة وصول المالك','تتطلب رمز التهيئة المضبوط في أسرار الخادم. تعيد تفعيل حساب المالك وتنهي جلساته السابقة.']
 };
 const needsName=screen==='setup'||screen==='invite',needsEmail=screen==='login'||screen==='setup'||screen==='recover',needsToken=(screen==='setup'&&status?.mode!=='sites')||screen==='recover';
 const blocked=screen==='setup'&&status&&!status.setupConfigured,linkBroken=(screen==='invite'||screen==='reset')&&!info;
 const Icon=screen==='login'?LogIn:screen==='invite'?UserPlus:screen==='setup'?ShieldCheck:KeyRound;
 return <main className="auth-page" dir="rtl">
  <section className="auth-card">
   <div className="brand-word">لُب<span className="brand-dot"/></div>
   {!status&&!loadError&&<div className="auth-loading"><Loader2 className="spin" size={20}/>جارٍ التحقق من الجلسة…</div>}
   {loadError&&<div className="error-banner" role="alert"><AlertCircle/>{loadError}<Button variant="outline" onClick={load}>إعادة المحاولة</Button></div>}
   {status&&<form onSubmit={submit} className="auth-form" noValidate>
    <div><h1><Icon size={22}/>{titles[screen][0]}</h1><p>{titles[screen][1]}</p></div>
    {blocked&&<div className="notice" role="status">{status.mode==='sites'?'تعذر قراءة هوية Sites لهذا الطلب. افتح التطبيق من رابطه في Sites.':'اضبط السر LUB_SETUP_TOKEN في بيئة الخادم (أو في ملف .dev.vars محليًا) ثم أعد تحميل الصفحة.'}</div>}
    {needsName&&<Field label="الاسم"><Input value={form.name} onChange={set('name')} autoComplete="name" required maxLength={80} disabled={!!blocked||linkBroken}/></Field>}
    {needsEmail&&<Field label="البريد الإلكتروني"><Input type="email" dir="ltr" value={form.email} onChange={set('email')} autoComplete="email" required maxLength={200} disabled={!!blocked}/></Field>}
    {needsToken&&<Field label="رمز التهيئة" hint="القيمة المضبوطة في LUB_SETUP_TOKEN. لا تُحفظ في المتصفح."><Input type="password" dir="ltr" value={form.setupToken} onChange={set('setupToken')} autoComplete="off" required disabled={!!blocked}/></Field>}
    <Field label={screen==='login'?'كلمة المرور':'كلمة مرور جديدة'} hint={screen==='login'?undefined:'10 أحرف على الأقل.'}><Input type="password" dir="ltr" value={form.password} onChange={set('password')} autoComplete={screen==='login'?'current-password':'new-password'} required disabled={!!blocked||linkBroken}/></Field>
    {screen!=='login'&&<Field label="تأكيد كلمة المرور"><Input type="password" dir="ltr" value={form.confirm} onChange={set('confirm')} autoComplete="new-password" required disabled={!!blocked||linkBroken}/></Field>}
    {error&&<p className="auth-error" role="alert"><AlertCircle size={16}/>{error}</p>}
    <Button type="submit" disabled={busy||!!blocked||linkBroken}>{busy?<Loader2 className="spin" size={16}/>:<Icon size={16}/>}{screen==='login'?'دخول':screen==='setup'?'إنشاء حساب المالك':screen==='invite'?'تفعيل الحساب':screen==='reset'?'حفظ كلمة المرور':'استعادة الوصول'}</Button>
    <div className="auth-links">
     {screen!=='login'&&!status.setupRequired&&<button type="button" onClick={()=>{setScreen('login');setError('');}}>العودة إلى الدخول</button>}
     {screen==='login'&&<span>نسيت كلمة المرور؟ اطلب رابط استعادة من مالك المساحة.</span>}
     {screen==='login'&&status.mode==='local'&&<button type="button" onClick={()=>{setScreen('recover');setError('');}}>استعادة وصول المالك</button>}
    </div>
   </form>}
  </section>
  <Toaster position="bottom-left" richColors dir="rtl"/>
 </main>;
}
