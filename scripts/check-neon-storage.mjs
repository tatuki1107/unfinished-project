// Live integration check; creates only uniquely identified temporary QA records.
import http from 'node:http';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createNeonDatabase} from '../lib/neon-database.mjs';
import {createCloudHandler} from '../cloud-server.mjs';
import {createNeonStorage} from '../lib/neon-storage.mjs';
import {put} from '@vercel/blob/client';
import {del} from '@vercel/blob';
const db=createNeonDatabase(process.env.DATABASE_URL),user={id:randomUUID(),displayName:'Migration QA',role:'member'};
await db.sql.query('INSERT INTO public.profiles(id,display_name) VALUES ($1,$2)',[user.id,user.displayName]);
const server=http.createServer(createCloudHandler({config:{url:'http://localhost'},database:db,backend:'neon',secure:false,identity:async req=>req.headers['x-qa']==='yes'?user:null,handleStorage:createNeonStorage(db)}));
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
async function call(path,method='GET',data,owner=true){const r=await fetch(base+path,{method,redirect:'manual',headers:{origin:base,'content-type':'application/json',...(owner?{'x-qa':'yes'}:{})},body:data===undefined?undefined:JSON.stringify(data)});return {status:r.status,body:r.status===302?null:await r.json(),location:r.headers.get('location')};}
try {
 const bytes=Buffer.from('添付ファイルの検証です。\n移行確認用データ');
 const signed=await call('/api/uploads/sign','POST',{name:'migration-qa.txt',size:bytes.length,kind:'asset'});assert.equal(signed.status,200);
 await put(signed.body.pathname,bytes,{access:'private',token:signed.body.token,contentType:signed.body.type});
 const verified=await call('/api/uploads/'+signed.body.id+'/verify','POST',{});assert.equal(verified.status,200,JSON.stringify(verified.body));
 const created=await call('/api/projects','POST',{title:'Migration QA',summary:'一時検証',category:'novel',visibility:'private',upload:verified.body});assert.equal(created.status,201);
 assert.equal((await call('/uploads/'+signed.body.id,'GET',undefined,false)).status,404);
 const opened=await call('/uploads/'+signed.body.id);assert.equal(opened.status,302,JSON.stringify(opened.body));
 const content=await fetch(opened.location);assert.equal(content.status,200);assert.equal(await content.text(),bytes.toString());
 console.log('LIVE PASS: signed upload, byte validation, private attachment denial, owner download');
}finally{
 const rows=await db.sql.query('SELECT object_path FROM public.uploads WHERE owner_id=$1',[user.id]);
 for(const row of rows)await del(row.object_path);
 await db.sql.query('DELETE FROM public.projects WHERE author_id=$1',[user.id]);await db.sql.query('DELETE FROM public.uploads WHERE owner_id=$1',[user.id]);await db.sql.query('DELETE FROM public.profiles WHERE id=$1',[user.id]);
 await new Promise(r=>server.close(r));console.log('Temporary QA data removed');
}
