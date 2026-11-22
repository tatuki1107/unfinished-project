import { readFile } from 'node:fs/promises';
import { neon } from '@neondatabase/serverless';

// Initialize a NEW database only. Existing tables abort the transaction.
const original=await readFile(new URL('../supabase/migrations/202609180001_initial.sql',import.meta.url),'utf8');
let schema=original.slice(original.indexOf('create table public.profiles'),original.indexOf('create function public.unfinished_create_profile'));
schema=schema.replace('id uuid primary key references auth.users(id) on delete cascade','id uuid primary key');
for(const table of ['profiles','projects','comments','bookmarks','notifications','reports','uploads']) {
  schema+=`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY; REVOKE ALL ON public.${table} FROM PUBLIC;\n`;
}
const sql=neon(process.env.DATABASE_URL);
const statements=schema.split(';').map(s=>s.trim()).filter(Boolean);
statements.push('create function public.unfinished_touch_project() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end; $$');
statements.push('create trigger unfinished_project_updated before update on public.projects for each row execute function public.unfinished_touch_project()');
await sql.transaction(statements.map(s=>sql.query(s)));
console.log('Neon application schema initialized. No existing content copied.');
