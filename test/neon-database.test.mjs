import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createNeonDatabase} from '../lib/neon-database.mjs';
import {createCloudHandler} from '../cloud-server.mjs';

test('Neon adapter preserves projects, branches, privacy, ownership and relations',async()=>{
 const pg=new PGlite();
 const original=await readFile(new URL('../supabase/migrations/202609180001_initial.sql',import.meta.url),'utf8');
 await pg.exec(original.slice(original.indexOf('create table public.profiles'),original.indexOf('create function public.unfinished_create_profile')).replace('id uuid primary key references auth.users(id) on delete cascade','id uuid primary key'));
 const db=createNeonDatabase(null,{query:async(s,p)=>(await pg.query(s,p)).rows});
 const users=[{id:'11111111-1111-4111-8111-111111111111',displayName:'作者',role:'member'},{id:'22222222-2222-4222-8222-222222222222',displayName:'読者',role:'member'}];
 for(const u of users)assert.equal((await db.from('profiles').insert({id:u.id,display_name:u.displayName})).error,null);
 const server=http.createServer(createCloudHandler({config:{url:'http://localhost'},database:db,backend:'neon',secure:false,identity:async req=>users[Number(req.headers['x-test-user'])]||null}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const call=async(path,method='GET',data,user)=>{const response=await fetch(origin+path,{method,headers:{origin,'content-type':'application/json',...(user!==undefined?{'x-test-user':String(user)}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:response.status,data:await response.json()};};
 try {
  assert.equal((await call('/api/health')).data.backend,'neon');
  const fields={title:"引用 ' と本文",summary:'紹介',content:'本文を読む',category:'novel'};
  assert.equal((await call('/api/projects','POST',fields)).status,401);
  const created=await call('/api/projects','POST',fields,0);assert.equal(created.status,201);
  const id=created.data.project.id;
  assert.equal((await call('/api/projects')).data.projects.length,1);
  assert.equal((await call(`/api/projects/${id}`)).data.project.content,'本文を読む');
  assert.equal((await call(`/api/projects/${id}`,'PATCH',fields,1)).status,403);
  assert.equal((await call(`/api/projects/${id}/branches`,'POST',{...fields,title:'続き'},1)).status,201);
  assert.equal((await call(`/api/projects/${id}/comments`,'POST',{body:'感想'},1)).status,201);
  const detail=await call(`/api/projects/${id}`);assert.equal(detail.data.branches.length,1);assert.equal(detail.data.comments[0].authorName,'読者');
  assert.equal((await call(`/api/projects/${id}/bookmark`,'POST',{},1)).data.bookmarked,true);
  assert.equal((await call('/api/me/bookmarks','GET',undefined,1)).data.projects.length,1);
  assert.equal((await call(`/api/projects/${id}/bookmark`,'POST',{},1)).data.bookmarked,false);
  assert.equal((await call('/api/me/notifications','GET',undefined,0)).data.notifications.length,2);
  assert.equal((await call(`/api/projects/${id}/report`,'POST',{reason:'テスト'},1)).status,201);
  assert.equal((await call('/api/admin/reports','GET',undefined,1)).status,403);
  assert.equal((await call(`/api/projects/${id}`,'PATCH',{...fields,visibility:'private'},0)).status,200);
  assert.equal((await call(`/api/projects/${id}`)).status,404);
  assert.equal((await call(`/api/projects/${id}`,'GET',undefined,0)).status,200);
  assert.equal((await call('/api/projects')).data.projects.length,0);
  assert.equal((await db.from('projects').select('*').eq('title',"' OR 1=1 --")).data.length,0);
  assert.throws(()=>db.from('projects; DROP TABLE profiles'));
  assert.equal((await db.from('uploads').select('id',{head:true,count:'exact'}).eq('owner_id',users[0].id)).count,0);
 } finally {await new Promise(r=>server.close(r));await pg.close();}
});
