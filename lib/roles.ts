// Shared by the server (enforcement) and the UI (hiding controls). The server is the authority.
export const roles=['owner','managing_editor','editor','producer','reviewer','publisher','viewer'] as const;
export type Role=typeof roles[number];
export const roleLabels:Record<Role,string>={owner:'المالك',managing_editor:'مدير التحرير',editor:'باحث أو محرر',producer:'مصمم أو منتج',reviewer:'مراجع',publisher:'مسؤول النشر',viewer:'مشاهد'};
export const roleDescriptions:Record<Role,string>={
 owner:'كامل الصلاحيات، وإدارة الحسابات والإعدادات.',
 managing_editor:'إدارة القصص وتوزيعها واعتمادها، والمهام وأعضاء الإسناد، والاطلاع على سجل النشاط.',
 editor:'إنشاء الأفكار، والبحث وكتابة القصص المسندة إليه.',
 producer:'إدارة الأصول والحقوق في القصص المسندة إليه، وإرسالها للمراجعة.',
 reviewer:'مراجعة المواد وإعادتها للإنتاج بملاحظات.',
 publisher:'جدولة المواد المعتمدة وتوثيق نشرها.',
 viewer:'الاطلاع فقط.'
};
export type Actor={id:string;name:string;role:Role};
export type Permission='story.create'|'story.manage'|'task.manage'|'member.manage'|'team.manage'|'team.details'|'activity.view';
const grants:Record<Permission,Role[]>={
 'story.create':['owner','managing_editor','editor'],
 'story.manage':['owner','managing_editor'],
 'task.manage':['owner','managing_editor'],
 'member.manage':['owner','managing_editor'],
 'team.manage':['owner'],
 'team.details':['owner','managing_editor'],
 'activity.view':['owner','managing_editor']
};
export function can(actor:Pick<Actor,'role'>|null|undefined,p:Permission){return !!actor&&grants[p].includes(actor.role);}
export function isRole(v:unknown):v is Role{return typeof v==='string'&&(roles as readonly string[]).includes(v);}

// Story assignments. `owner` is the person responsible for the story, distinct from the account owner role.
export const assignmentFields=['owner','researcher','writer','producer','reviewer'] as const;
export const assignmentLabels:Record<typeof assignmentFields[number],string>={owner:'المسؤول عن القصة',researcher:'الباحث',writer:'المحرر',producer:'المنتج',reviewer:'المراجع'};
type StoryLike={owner?:string;researcher?:string;writer?:string;producer?:string;reviewer?:string;status?:string};
export function assignedTo(story:StoryLike,userId:string){return assignmentFields.some(f=>story[f]===userId);}

const contentFields=['title','series','topic','format','angle','script','sourceUrl','sourceNote','sourceVerified'];
const assetFields=['assetUrl','rightsVerified'];
// Fields each actor may change on a given story. Managers edit everything; others only what their role produces, on stories assigned to them.
export function editableFields(actor:Actor|null|undefined,story:StoryLike):Set<string>{
 if(!actor)return new Set();
 if(can(actor,'story.manage'))return new Set(['*']);
 const mine=assignedTo(story,actor.id);
 if(actor.role==='editor'&&mine)return new Set(contentFields);
 if(actor.role==='producer'&&mine)return new Set(assetFields);
 if(actor.role==='publisher'&&['approved','planned'].includes(story.status||''))return new Set(['plannedAt']);
 return new Set();
}
export function canEditField(actor:Actor|null|undefined,story:StoryLike,field:string){const f=editableFields(actor,story);return f.has('*')||f.has(field);}

// Who may move a story between stages. Content readiness is checked separately by the server.
export function canTransition(actor:Actor|null|undefined,story:StoryLike,target:string):boolean{
 if(!actor||actor.role==='viewer')return false;
 const from=story.status||'',manager=can(actor,'story.manage'),mine=assignedTo(story,actor.id);
 if(target==='archived'||from==='archived')return manager;
 if(from==='idea'&&target==='research'||from==='research'&&target==='production')return manager||actor.role==='editor'&&mine;
 if(from==='production'&&target==='review')return manager||(actor.role==='editor'||actor.role==='producer')&&mine;
 if(from==='review'&&target==='approved')return manager;
 if(from==='review'&&target==='production')return manager||actor.role==='reviewer'&&(!story.reviewer||story.reviewer===actor.id);
 if(target==='planned')return manager||actor.role==='publisher';
 if(from==='planned'&&target==='approved')return manager||actor.role==='publisher';
 if(target==='published')return actor.role==='owner'||actor.role==='publisher';
 if(target==='production')return manager;
 return false;
}
