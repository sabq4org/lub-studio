import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('lub_records', {
 id:text('id').primaryKey(), kind:text('kind').notNull(), payload:text('payload').notNull(),
 version:integer('version').notNull().default(1), updatedAt:text('updated_at').notNull()
});
export const meta=sqliteTable('lub_meta',{key:text('key').primaryKey(),value:text('value').notNull()});
// Team accounts. `id` may reuse a legacy member record id so existing assignments carry over.
export const users=sqliteTable('lub_users',{
 id:text('id').primaryKey(), email:text('email').notNull().unique(), name:text('name').notNull(), role:text('role').notNull(),
 status:text('status').notNull().default('active'), passwordHash:text('password_hash'), sitesUserId:text('sites_user_id').unique(),
 createdAt:text('created_at').notNull(), updatedAt:text('updated_at').notNull(), lastLoginAt:text('last_login_at'), version:integer('version').notNull().default(1)
});
// Only SHA-256 hashes of session and invitation tokens are stored.
export const sessions=sqliteTable('lub_sessions',{
 id:text('id').primaryKey(), userId:text('user_id').notNull(), createdAt:text('created_at').notNull(), expiresAt:text('expires_at').notNull(), lastSeenAt:text('last_seen_at').notNull()
},t=>[index('lub_sessions_user_idx').on(t.userId)]);
export const tokens=sqliteTable('lub_tokens',{
 id:text('id').primaryKey(), kind:text('kind').notNull(), email:text('email').notNull(), name:text('name').notNull().default(''), role:text('role').notNull().default(''),
 userId:text('user_id'), memberId:text('member_id'), createdBy:text('created_by').notNull(), createdAt:text('created_at').notNull(), expiresAt:text('expires_at').notNull(),
 usedAt:text('used_at'), revokedAt:text('revoked_at')
},t=>[index('lub_tokens_email_idx').on(t.email)]);
export const activity=sqliteTable('lub_activity',{
 id:text('id').primaryKey(), at:text('at').notNull(), actorId:text('actor_id'), actorName:text('actor_name').notNull(), action:text('action').notNull(),
 entityKind:text('entity_kind').notNull(), entityId:text('entity_id'), summary:text('summary').notNull(), details:text('details')
},t=>[index('lub_activity_at_idx').on(t.at),index('lub_activity_entity_idx').on(t.entityId)]);
export const loginAttempts=sqliteTable('lub_login_attempts',{key:text('key').primaryKey(),count:integer('count').notNull(),windowStart:text('window_start').notNull()});
