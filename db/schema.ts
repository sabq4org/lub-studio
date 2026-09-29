import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const records = sqliteTable('lub_records', {
 id:text('id').primaryKey(), kind:text('kind').notNull(), payload:text('payload').notNull(),
 version:integer('version').notNull().default(1), updatedAt:text('updated_at').notNull()
});
export const meta=sqliteTable('lub_meta',{key:text('key').primaryKey(),value:text('value').notNull()});
