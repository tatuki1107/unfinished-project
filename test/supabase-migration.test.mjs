import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('Postgres migration: schema, private storage, Auth trigger, permissions, branch deletion', async () => {
  const db = new PGlite();
  try {
    // Minimal stand-ins for Supabase-managed roles and schemas. No cloud writes.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      grant usage on schema public to anon, authenticated, service_role;
      create schema auth; create table auth.users(id uuid primary key, raw_user_meta_data jsonb);
      create schema storage; create table storage.buckets(id text primary key, name text, public boolean,
        file_size_limit bigint, allowed_mime_types text[]);`);
    await db.exec(await readFile(new URL('../supabase/migrations/202609180001_initial.sql', import.meta.url), 'utf8'));
    const user = '10000000-0000-0000-0000-000000000001';
    await db.query('insert into auth.users values ($1, $2)', [user, { displayName: 'テスト作者', role: 'admin' }]);
    assert.deepEqual((await db.query('select display_name, role from public.profiles')).rows,
      [{ display_name: 'テスト作者', role: 'member' }]);
    assert.equal((await db.query('select public from storage.buckets')).rows[0].public, false);
    const tables = ['profiles','projects','comments','bookmarks','notifications','reports','uploads'];
    const rls = await db.query("select relname from pg_class join pg_namespace n on n.oid=relnamespace where n.nspname='public' and relrowsecurity");
    assert.deepEqual(rls.rows.map(r => r.relname).sort(), tables.toSorted());
    for (const role of ['anon','authenticated']) {
      await db.exec(`set role ${role}`);
      for (const table of tables) await assert.rejects(db.query(`select * from public.${table}`), /permission denied/);
      await assert.rejects(db.query("update public.profiles set role='admin'"), /permission denied/);
      await db.exec('reset role');
    }
    await db.exec('set role service_role');
    const parent = (await db.query("insert into public.projects(author_id,category,title,summary) values ($1,'novel','原案','概要') returning id", [user])).rows[0].id;
    const child = (await db.query("insert into public.projects(author_id,parent_id,category,title,summary) values ($1,$2,'novel','派生','概要') returning id", [user,parent])).rows[0].id;
    await assert.rejects(db.query("update public.projects set visibility='invalid' where id=$1", [child]), /check constraint/);
    await db.query('delete from public.projects where id=$1', [parent]);
    assert.equal((await db.query('select parent_id from public.projects where id=$1', [child])).rows[0].parent_id, null);
    await db.exec('reset role');
  } finally { await db.close(); }
});
