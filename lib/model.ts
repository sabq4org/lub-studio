export const statuses=['idea','research','production','review','approved','planned','published','archived'] as const;
export type Status=typeof statuses[number];
export const labels:Record<Status,string>={idea:'فكرة',research:'قيد البحث',production:'قيد الإنتاج',review:'للمراجعة',approved:'معتمد',planned:'مخطط للنشر',published:'منشور يدويًا',archived:'مؤرشف'};
export const series=['لُب يشرح','لُب بالأرقام','الصورة كاملة'];
export const topics=['اقتصاد الحياة','التقنية وتأثيرها','السعودية بالأرقام'];
export const formats=['فيديو قصير','إنفوجرافيك','موشن جرافيك','سلسلة منشورات','تغطية'];
export type Story={id:string;version:number;title:string;series:string;topic:string;format:string;owner:string;status:Status;priority:string;due:string;plannedAt:string;angle:string;script:string;sourceUrl:string;sourceNote:string;sourceVerified:boolean;rightsVerified:boolean;assetUrl:string;postUrl:string;updatedAt:string;history:{at:string;message:string}[]};
export type Task={id:string;version:number;title:string;owner:string;phase:string;done:boolean;acceptance:string;due:string};
export type Member={id:string;version:number;name:string;role:string};
export type Workspace={stories:Story[];tasks:Task[];members:Member[];updatedAt:string};
export function blockers(s:Partial<Story>):string[]{const b=[];if(!s.sourceUrl)b.push('إضافة رابط المصدر');if(!s.sourceVerified)b.push('التحقق من المصدر والأرقام');if(!s.script?.trim())b.push('كتابة النص النهائي');if(!s.rightsVerified)b.push('تأكيد حقوق المواد');if(s.format!=='سلسلة منشورات'&&!s.assetUrl)b.push('إرفاق رابط النسخة النهائية');return b;}
export function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
export function gaps(stories:Story[]){const active=stories.filter(s=>!['published','archived'].includes(s.status));return [
{key:'sources',title:'قصص تحتاج توثيقًا',detail:'أضف المصدر وثبّت التحقق قبل إرسال المادة للمراجعة.',stories:active.filter(s=>!s.sourceUrl||!s.sourceVerified)},
{key:'owners',title:'قصص دون مسؤول',detail:'إسناد القصة يوضح من يملك خطوة العمل التالية.',stories:active.filter(s=>!s.owner)},
{key:'overdue',title:'مواعيد تسليم متأخرة',detail:'راجع الموعد أو أعد توزيع المهام على الفريق.',stories:active.filter(s=>s.due&&s.due<today())},
{key:'review',title:'مواد تنتظر المراجعة',detail:'راجع المصدر والنص والنسخة النهائية واتخذ القرار.',stories:active.filter(s=>s.status==='review')}
].filter(g=>g.stories.length);}
