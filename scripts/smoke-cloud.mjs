// Explicit opt-in integration test. Creates and removes only its own records.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { supabaseConfig } from '../lib/supabase-config.mjs';
const config=supabaseConfig(), base=process.env.SMOKE_URL||'http://127.0.0.1:5174';
const admin=createClient(config.url,config.secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
const users=[], projects=[], uploads=[];
const jars=['',''];
async function call(path,method='GET',body,actor=-1,expected=200) {
  const response=await fetch(new URL(path,base),{method,headers:{origin:new URL(base).origin,'content-type':'application/json',cookie:actor<0?'':jars[actor]},body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  if(actor>=0 && response.headers.getSetCookie().length) jars[actor]=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  const payload=await response.json().catch(()=>({}));
  assert.equal(response.status,expected,`${method} ${path}: unexpected HTTP status (${payload.error||''})`);
  return payload;
}
try {
  for(let i=0;i<2;i++) {
    const email=`smoke-${randomUUID()}@example.com`, password=randomUUID()+'aA1!';
    const {data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{displayName:`検証専用${i}`}});
    if(error)throw Error('Test user creation failed');users.push(data.user.id);
    await call('/api/auth/login','POST',{email,password},i);
  }
  const payload={category:'novel',title:'検証用作品',summary:'公開前の一時テスト',content:'本文',authorNote:'メモ',visibility:'public',status:'published',license:'derivatives-ok'};
  const parent=(await call('/api/projects','POST',payload,0,201)).project;projects.push(parent.id);
  assert.equal((await call(`/api/projects/${parent.id}`)).project.content,'本文');
  await call(`/api/projects/${parent.id}`,'PATCH',payload,1,403);
  await call(`/api/projects/${parent.id}/comments`,'POST',{body:'検証コメント'},1,201);
  await call(`/api/projects/${parent.id}/bookmark`,'POST',{},1);
  await call(`/api/projects/${parent.id}/report`,'POST',{reason:'検証'},1,201);
  await call('/api/admin/reports','GET',undefined,1,403);
  const branch=(await call(`/api/projects/${parent.id}/branches`,'POST',payload,1,201)).project;projects.push(branch.id);
  assert.equal((await call(`/api/projects/${parent.id}`)).branches.length,1);
  const bytes=Buffer.from('検証ファイル','utf8');
  const signed=await call('/api/uploads/sign','POST',{name:'test.txt',size:bytes.length,kind:'asset'},0);uploads.push(signed.id);
  const put=await fetch(signed.url,{method:'PUT',headers:{'content-type':signed.type,'x-upsert':'false'},body:bytes});assert.equal(put.ok,true,'Direct upload failed');
  await call(`/api/uploads/${signed.id}/verify`,'POST',{},1,404);
  await call(`/api/uploads/${signed.id}/verify`,'POST',{},0);
  await call(`/uploads/${signed.id}`,'GET',undefined,-1,404);
  await call(`/api/projects/${parent.id}`,'PATCH',{...payload,upload:{id:signed.id}},1,403);
  await call(`/api/projects/${parent.id}`,'PATCH',{...payload,upload:{id:signed.id}},0);
  const file=await fetch(`${base}/uploads/${signed.id}`,{redirect:'manual'});assert.equal(file.status,302);
  const download=await fetch(file.headers.get('location'));assert.equal(await download.text(),'検証ファイル');
  await call(`/api/projects/${parent.id}`,'PATCH',{...payload,visibility:'private'},0);
  await call(`/api/projects/${parent.id}`,'GET',undefined,-1,404);
  await call(`/uploads/${signed.id}`,'GET',undefined,-1,404);
  await call(`/api/projects/${parent.id}/comments`,'POST',{body:'禁止'},1,404);
  assert.equal((await call('/api/me/bookmarks','GET',undefined,1)).projects.length,0);
  await call('/api/auth/logout','POST',{},0);
  assert.equal((await call('/api/session','GET',undefined,0)).user,null);
  console.log('PASS: login, projects, ownership, branch, comments, bookmarks, reports, direct upload, protected download, logout');
} finally {
  let cleanupFailed=false;
  for(const id of projects.reverse()) {const {error}=await admin.from('projects').delete().eq('id',id);if(error)cleanupFailed=true;}
  for(const id of uploads) {
    const {data,error}=await admin.from('uploads').select('object_path').eq('id',id).maybeSingle();if(error)cleanupFailed=true;
    if(data){const r=await admin.storage.from(config.bucket).remove([data.object_path]);if(r.error)cleanupFailed=true;}
    const r=await admin.from('uploads').delete().eq('id',id);if(r.error)cleanupFailed=true;
  }
  for(const id of users){const {error}=await admin.auth.admin.deleteUser(id);if(error)cleanupFailed=true;}
  if(cleanupFailed){console.error('Test cleanup incomplete; inspect test records before deployment.');process.exitCode=1;}
  else console.log('Test records removed.');
}
