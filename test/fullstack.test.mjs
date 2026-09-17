import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createAppServer } from "../server.mjs";

async function start() {
  const dataDir = await mkdtemp(join(tmpdir(),"unfinished-project-"));
  const server = createAppServer({dataDir,staticDir:resolve("dist")});
  await new Promise(resolvePromise=>server.listen(0,"127.0.0.1",resolvePromise));
  const base=`http://127.0.0.1:${server.address().port}`;
  return {base,dataDir,close:async()=>{await new Promise(r=>server.close(r));await rm(dataDir,{recursive:true,force:true});}};
}

async function request(base,path,{cookie,method="GET",json}={}) {
  const response=await fetch(base+path,{method,headers:{...(cookie?{cookie}:{}),...(json?{"content-type":"application/json"}:{})},body:json?JSON.stringify(json):undefined});
  const body=await response.json();
  return {response,body,cookie:response.headers.get("set-cookie")?.split(";")[0]};
}

test('attachments enforce visibility and URL validation; 6MiB payload works',async()=>{
 const app=await start();
 try{
  const login=await request(app.base,'/api/auth/login',{method:'POST',json:{email:'madoka@example.com',password:'demo1234'}});
  const cookie=login.cookie;
  const base={category:'novel',title:'添付検証',summary:'検証',visibility:'private',status:'published',externalUrl:'https://example.com/work'};
  const upload={name:'work.txt',type:'text/plain',data:Buffer.alloc(6*1024*1024,65).toString('base64')};
  const created=await request(app.base,'/api/projects',{cookie,method:'POST',json:{...base,upload}});
  assert.equal(created.response.status,201); const p=created.body.project;
  assert.equal(p.externalUrl,base.externalUrl);
  assert.equal((await fetch(app.base+p.assetUrl)).status,404);
  const owned=await fetch(app.base+p.assetUrl,{headers:{cookie}}); assert.equal(owned.status,200);assert.equal(owned.headers.get('cache-control'),'private, no-store'); await owned.arrayBuffer();
  const invalid=await request(app.base,'/api/projects',{cookie,method:'POST',json:{...base,externalUrl:'javascript:alert(1)'}});assert.equal(invalid.response.status,400);
  const spoof=await request(app.base,'/api/projects',{cookie,method:'POST',json:{...base,upload:{name:'fake.png',type:'image/png',data:Buffer.from('fake').toString('base64')}}});assert.equal(spoof.response.status,400);
  const foreign=await request(app.base,'/api/auth/login',{method:'POST',json:{email:'rui@example.com',password:'demo1234'}});
  assert.equal((await fetch(app.base+p.assetUrl,{headers:{cookie:foreign.cookie}})).status,404);
  const branch=await request(app.base,`/api/projects/${p.id}/branches`,{cookie:foreign.cookie,method:'POST',json:{title:'不正',summary:'不正'}});assert.equal(branch.response.status,403);
  await request(app.base,`/api/projects/${p.id}`,{cookie,method:'PATCH',json:{...base,visibility:'public'}});
  const publicFile=await fetch(app.base+p.assetUrl);assert.equal(publicFile.status,200);await publicFile.arrayBuffer();
  await request(app.base,`/api/projects/${p.id}`,{cookie,method:'PATCH',json:{...base,visibility:'public',status:'draft'}});
  assert.equal((await fetch(app.base+p.assetUrl)).status,404);
 }finally{await app.close();}
});

test("full product API covers authentication, project, branch, comment, bookmark and report flows",async()=>{
  const app=await start();
  try {
    const health=await request(app.base,"/api/health"); assert.equal(health.body.ok,true);
    const register=await request(app.base,"/api/auth/register",{method:"POST",json:{displayName:"テスト作者",email:"test@example.com",password:"password123"}}); assert.equal(register.response.status,201); assert.ok(register.cookie);
    const created=await request(app.base,"/api/projects",{cookie:register.cookie,method:"POST",json:{category:"novel",title:"途中の物語",summary:"まだ終わっていない物語です",content:"続きを待っています",visibility:"public",status:"published"}}); assert.equal(created.response.status,201);
    const id=created.body.project.id;
    const branch=await request(app.base,`/api/projects/${id}/branches`,{cookie:register.cookie,method:"POST",json:{category:"novel",title:"別の結末",summary:"新しい視点からの続き",visibility:"public",status:"published"}}); assert.equal(branch.response.status,201);
    const comment=await request(app.base,`/api/projects/${id}/comments`,{cookie:register.cookie,method:"POST",json:{body:"続きを楽しみにしています"}}); assert.equal(comment.response.status,201);
    const bookmark=await request(app.base,`/api/projects/${id}/bookmark`,{cookie:register.cookie,method:"POST",json:{}}); assert.equal(bookmark.body.bookmarked,true);
    const report=await request(app.base,`/api/projects/${id}/report`,{cookie:register.cookie,method:"POST",json:{reason:"その他",detail:"確認用"}}); assert.equal(report.response.status,201);
    const detail=await request(app.base,`/api/projects/${id}`,{cookie:register.cookie}); assert.equal(detail.body.branches.length,1); assert.equal(detail.body.comments.length,1); assert.equal(detail.body.project.bookmarked,true);
    const logout=await request(app.base,"/api/auth/logout",{cookie:register.cookie,method:"POST",json:{}}); assert.equal(logout.body.ok,true);
  } finally { await app.close(); }
});

test('private transitions protect bookmarks, comments and reports; author note remains separate',async()=>{
 const app=await start();try{
  const owner=(await request(app.base,'/api/auth/login',{method:'POST',json:{email:'madoka@example.com',password:'demo1234'}})).cookie;
  const other=(await request(app.base,'/api/auth/login',{method:'POST',json:{email:'rui@example.com',password:'demo1234'}})).cookie;
  const created=await request(app.base,'/api/projects',{method:'POST',cookie:owner,json:{title:'公開から非公開',summary:'概要',category:'novel',content:'本文のみ',authorNote:'作者メモのみ'}});
  const id=created.body.project.id;
  assert.equal(created.body.project.content,'本文のみ');assert.equal(created.body.project.authorNote,'作者メモのみ');
  await request(app.base,`/api/projects/${id}/bookmark`,{method:'POST',cookie:other,json:{}});
  await request(app.base,`/api/projects/${id}`,{method:'PATCH',cookie:owner,json:{visibility:'private',content:'本文のみ'}});
  const saved=await request(app.base,'/api/me/bookmarks',{cookie:other});assert.equal(saved.body.projects.some(p=>p.id===id),false);
  for(const [endpoint,json] of [['comments',{body:'侵入'}],['bookmark',{}],['report',{reason:'侵入'}]]){
    assert.equal((await request(app.base,`/api/projects/${id}/${endpoint}`,{method:'POST',cookie:other,json})).response.status,404);
  }
  const detail=await request(app.base,`/api/projects/${id}`,{cookie:owner});assert.equal(detail.body.project.authorNote,'作者メモのみ');
 }finally{await app.close();}
});

test("authorization protects private and administrative operations",async()=>{
  const app=await start();
  try {
    const anon=await request(app.base,"/api/projects/p-post",{method:"DELETE",json:{}}); assert.equal(anon.response.status,401);
    const login=await request(app.base,"/api/auth/login",{method:"POST",json:{email:"admin@example.com",password:"admin1234"}}); assert.equal(login.response.status,200);
    const reports=await request(app.base,"/api/admin/reports",{cookie:login.cookie}); assert.equal(reports.response.status,200); assert.ok(Array.isArray(reports.body.reports));
  } finally { await app.close(); }
});
