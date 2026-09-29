export const statuses=['idea','research','production','review','approved','planned','published','archived'] as const;
export type Status=typeof statuses[number];
export const labels:Record<Status,string>={idea:'فكرة',research:'قيد البحث',production:'قيد الإنتاج',review:'للمراجعة',approved:'معتمد',planned:'مخطط للنشر',published:'منشور يدويًا',archived:'مؤرشف'};
export const series=['لُب يشرح','لُب بالأرقام','الصورة كاملة'];
export const topics=['اقتصاد الحياة','التقنية وتأثيرها','السعودية بالأرقام'];
export const formats=['فيديو قصير','إنفوجرافيك','موشن جرافيك','سلسلة منشورات','تغطية'];
export type Source={id:string;url:string;publisher:string;title:string;publishedAt:string;accessedAt:string;kind:SourceKind};
export const sourceKinds=['official_sa','official','data','media','other'] as const;
export type SourceKind=typeof sourceKinds[number];
export const sourceKindLabels:Record<SourceKind,string>={official_sa:'جهة سعودية رسمية',official:'جهة رسمية أخرى',data:'قاعدة بيانات أو تقرير',media:'وسيلة إعلام',other:'مصدر آخر'};
export const claimKinds=['fact','estimate','inference'] as const;
export type ClaimKind=typeof claimKinds[number];
export const claimKindLabels:Record<ClaimKind,string>={fact:'حقيقة مؤكدة',estimate:'تقدير',inference:'استنتاج تحريري'};
export type Claim={id:string;text:string;figure:string;kind:ClaimKind;sourceIds:string[];verified:boolean};
export const outputFormats=['post','thread','video','image'] as const;
export type OutputFormat=typeof outputFormats[number];
export const outputFormatLabels:Record<OutputFormat,string>={post:'منشور',thread:'سلسلة',video:'فيديو',image:'صورة أو إنفوجرافيك'};
export const platforms=['x'] as const;
export const platformLabels:Record<typeof platforms[number],string>={x:'X'};
export type Output={id:string;platform:typeof platforms[number];format:OutputFormat;parts:string[];assetUrl:string};
export const checklistItems=[['sources','المصادر موثقة ومفتوحة وتواريخها صحيحة'],['figures','الأرقام مطابقة لمصادرها بالوحدة والفترة'],['labels','الحقائق مميزة عن التقديرات والاستنتاجات'],['quotes','الاقتباسات منسوبة بدقة أو لا توجد'],['rights','حقوق الوسائط والنسبة المطلوبة واضحة'],['language','اللغة سليمة والعنوان لا يبالغ'],['platform','المخرجات مناسبة للمنصة وطول النص']] as const;
export type ChecklistKey=typeof checklistItems[number][0];
export type Story={id:string;version:number;title:string;series:string;topic:string;format:string;owner:string;researcher?:string;writer?:string;producer?:string;reviewer?:string;status:Status;priority:string;due:string;plannedAt:string;angle:string;audience?:string;script:string;sources?:Source[];claims?:Claim[];outputs?:Output[];checklist?:Partial<Record<ChecklistKey,boolean>>;checklistBy?:string;checklistAt?:string;sourceUrl:string;sourceNote:string;sourceVerified:boolean;rightsVerified:boolean;assetUrl:string;postUrl:string;updatedAt:string;contentVersion?:number;approvedBy?:string;approvedAt?:string;approvedHash?:string;approvedContentVersion?:number;publishedBy?:string;publishedAt?:string;history:{at:string;message:string;by?:string;byId?:string}[]};
export type Task={id:string;version:number;title:string;owner:string;phase:string;done:boolean;acceptance:string;due:string};
export type Member={id:string;version:number;name:string;role:string};
export type TeamUser={id:string;name:string;role:string;status:string};
export type Workspace={stories:Story[];tasks:Task[];members:Member[];users:TeamUser[];updatedAt:string};
export const X_LIMIT=280;
// Advisory checks from the «لُب» style guide (voice and figures). They never block review; the editor decides.
const emoji=/\p{Extended_Pictographic}/u,easternDigits=/[٠-٩]/,figure=/[0-9٠-٩]/;
const clickbait=['لن تصدق','صادم','عاجل وخطير','لا يفوتك','ستصدم'];
export function styleHints(parts:string[]){
 const text=parts.join('\n'),hints:string[]=[];
 if(emoji.test(text))hints.push('دليل الأسلوب: لا رموز تعبيرية في النص.');
 if(clickbait.some(w=>text.includes(w)))hints.push('دليل الأسلوب: اجعل العنوان سؤالًا أو خلاصة، لا تشويقًا فارغًا.');
 if((text.match(/!/g)||[]).length>1)hints.push('دليل الأسلوب: علامة التعجب نادرة.');
 if(easternDigits.test(text))hints.push('دليل الأسلوب: اكتب الأرقام بالأرقام الغربية 0–9.');
 if(/[0-9]\s?%/.test(text))hints.push('دليل الأسلوب: استخدم علامة النسبة العربية «٪» بعد الرقم.');
 if(figure.test(text)&&!text.includes('المصدر'))hints.push('دليل الأسلوب: أضف سطر «المصدر: الجهة، السنة» حين يرد رقم.');
 return hints;
}
const completeSource=(x:Source)=>!!(x.url&&x.publisher.trim()&&x.accessedAt);
// Requirements before a story can go to review, be approved, planned or published.
export function blockers(s:Partial<Story>):string[]{
 const b:string[]=[];const sources=s.sources||[],claims=s.claims||[],outputs=s.outputs||[],ids=new Set(sources.map(x=>x.id));
 if(!sources.some(completeSource))b.push('إضافة مصدر برابطه وجهته وتاريخ الاطلاع');
 else if(sources.some(x=>!completeSource(x)))b.push('إكمال بيانات كل مصدر (الرابط والجهة وتاريخ الاطلاع)');
 if(s.topic==='السعودية بالأرقام'&&!sources.some(x=>x.kind==='official_sa'))b.push('إضافة مصدر سعودي رسمي');
 if(claims.some(c=>c.kind!=='inference'&&!c.sourceIds.some(id=>ids.has(id))))b.push('ربط كل رقم أو ادعاء بمصدره');
 if(claims.some(c=>c.kind==='fact'&&!c.verified))b.push('التحقق من الحقائق المؤكدة');
 if(!s.sourceVerified)b.push('التحقق من المصدر والأرقام');
 if(!s.script?.trim())b.push('كتابة النص النهائي');
 if(!outputs.some(o=>o.parts.some(p=>p.trim())))b.push('إعداد مخرج لمنصة واحدة على الأقل');
 if(outputs.some(o=>o.platform==='x'&&o.parts.some(p=>p.length>X_LIMIT)))b.push(`تقصير نصوص X إلى ${X_LIMIT} حرفًا لكل منشور`);
 if(!s.rightsVerified)b.push('تأكيد حقوق المواد');
 if(s.format!=='سلسلة منشورات'&&!s.assetUrl)b.push('إرفاق رابط النسخة النهائية');
 return b;
}
// Approval also needs the reviewer's checklist.
export function approvalBlockers(s:Partial<Story>):string[]{const missing=checklistItems.filter(([k])=>!s.checklist?.[k]);return [...blockers(s),...(missing.length?['استكمال قائمة تحقق المراجعة ('+missing.length+' بنود)']:[])];}
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function gaps(stories:Story[]){const active=stories.filter(s=>!['published','archived'].includes(s.status));return [
{key:'sources',title:'قصص تحتاج توثيقًا',detail:'أضف المصدر وثبّت التحقق قبل إرسال المادة للمراجعة.',stories:active.filter(s=>!(s.sources||[]).some(completeSource)||!s.sourceVerified)},
{key:'owners',title:'قصص دون مسؤول',detail:'إسناد القصة يوضح من يملك خطوة العمل التالية.',stories:active.filter(s=>!s.owner)},
{key:'overdue',title:'مواعيد تسليم متأخرة',detail:'راجع الموعد أو أعد توزيع المهام على الفريق.',stories:active.filter(s=>s.due&&s.due<today())},
{key:'review',title:'مواد تنتظر المراجعة',detail:'راجع المصدر والنص والنسخة النهائية واتخذ القرار.',stories:active.filter(s=>s.status==='review')}
].filter(g=>g.stories.length);}
