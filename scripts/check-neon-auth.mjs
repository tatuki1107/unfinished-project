// Creates and deletes a unique synthetic account; never sends an email.
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomUUID,randomBytes,randomInt,createHash} from 'node:crypto';
import {hashPassword} from 'better-auth/crypto';
import {createNeonDatabase} from '../lib/neon-database.mjs';
import {createNeonHandler} from '../neon-server.mjs';
const db=createNeonDatabase(process.env.DATABASE_URL),id=randomUUID(),email=`qa-${id}@example.invalid`,password=randomBytes(30).toString('base64url');
let server,base=process.env.QA_BASE_URL;
if(!base){server=http.createServer(createNeonHandler({secure:false}));await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;}
let cookie='';
async function call(path,method='GET',data){const r=await fetch(base+path,{method,headers:{origin:base,'content-type':'application/json',cookie},body:data===undefined?undefined:JSON.stringify(data)});const values=r.headers.getSetCookie();if(values.length)cookie=values.map(v=>v.split(';')[0]).join('; ');return{status:r.status,body:await r.json(),cookies:values};}
try {
 await db.sql.query('INSERT INTO neon_auth."user"(id,name,email,"emailVerified") VALUES ($1,$2,$3,true)',[id,'Migration QA',email]);
 await db.sql.query('INSERT INTO neon_auth.account("accountId","providerId","userId",password,"updatedAt") VALUES ($1::text,$2,$1::uuid,$3,now())',[id,'credential',await hashPassword(password)]);
 assert.equal((await call('/api/auth/login','POST',{email,password:'wrong-password'})).status,400);
 const login=await call('/api/auth/login','POST',{email,password});assert.equal(login.status,200,JSON.stringify(login.body));assert.equal(login.body.user.id,id);
 assert.ok(login.cookies.some(v=>v.includes('HttpOnly')));
 assert.equal((await call('/api/session')).body.user.id,id);
 const created=await call('/api/projects','POST',{category:'novel',title:'Migration QA',summary:'Temporary verification',content:'本文',visibility:'private'});assert.equal(created.status,201);
 assert.equal((await call('/api/projects?mine=1')).body.projects.length,1);
 assert.equal((await call('/api/auth/logout','POST',{})).status,200);
 assert.equal((await call('/api/session')).body.user,null);
 const otp=String(randomInt(100000,1000000));
 await db.sql.query('UPDATE neon_auth."user" SET "emailVerified"=false WHERE id=$1',[id]);
 await db.sql.query('INSERT INTO neon_auth.verification(identifier,value,"expiresAt") VALUES ($1,$2,now()+interval \'5 minutes\')',[`email-verification-otp-${email}`,createHash('sha256').update(otp).digest('base64url')+':0']);
 const verification=await call('/api/auth/verify','POST',{email,otp});assert.equal(verification.status,200,JSON.stringify(verification.body));
 assert.equal((await call('/api/session')).body.user?.id,id,'Verification must establish a session');
 assert.equal((await call('/api/auth/verify','POST',{email,otp})).status,400,'OTP must not be reusable');
 console.log('LIVE PASS: password login, HttpOnly session, authenticated private posting, logout');
}finally{
 await db.sql.query('DELETE FROM public.projects WHERE author_id=$1',[id]);
 await db.sql.query('DELETE FROM public.profiles WHERE id=$1',[id]);
 await db.sql.query('DELETE FROM neon_auth.session WHERE "userId"=$1',[id]);
 await db.sql.query('DELETE FROM neon_auth.account WHERE "userId"=$1',[id]);
 await db.sql.query('DELETE FROM neon_auth."user" WHERE id=$1',[id]);
 await db.sql.query('DELETE FROM neon_auth.verification WHERE identifier=$1',[`email-verification-otp-${email}`]);
 if(server)await new Promise(r=>server.close(r));console.log('Temporary QA account removed');
}
