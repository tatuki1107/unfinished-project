import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {createCloudHandler,AUTH_CALLBACK_URL} from '../cloud-server.mjs';

test('mail endpoints validate input, protect origin, use signup resend and handle provider failures',async()=>{
 let calls=[],error=null;
 const auth={resend:async input=>{calls.push(input);return {error};},resetPasswordForEmail:async (email,options)=>{calls.push({email,options});return {error};},signUp:async input=>{calls.push(input);return {data:{session:null,user:null},error};}};
 const server=http.createServer(createCloudHandler({config:{url:'https://example.supabase.co',bucket:'test'},secure:false,clientFactory:()=>({auth,storage:{from:()=>({})}})}));
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base=`http://127.0.0.1:${server.address().port}`;
 const post=(path,email,origin=base)=>fetch(base+path,{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify({email})});
 try{
  assert.equal((await post('/api/auth/resend','mail@example.com','https://evil.example')).status,403);
  for(const path of ['/api/auth/resend','/api/auth/recover'])assert.equal((await post(path,'bad')).status,400);
  assert.equal(calls.length,0);
  assert.equal((await post('/api/auth/resend','mail@example.com')).status,200);
  assert.deepEqual(calls[0],{type:'signup',email:'mail@example.com',options:{emailRedirectTo:AUTH_CALLBACK_URL}});
  assert.equal((await post('/api/auth/recover','mail@example.com')).status,200);
  assert.deepEqual(calls[1],{email:'mail@example.com',options:{redirectTo:AUTH_CALLBACK_URL}});
  const registration=await fetch(base+'/api/auth/register',{method:'POST',headers:{origin:base,'content-type':'application/json'},body:JSON.stringify({email:'mail@example.com',password:'test-password',displayName:'Test'})});
  assert.equal(registration.status,200);assert.equal((await registration.json()).confirmationRequired,true);assert.equal(calls[2].options.emailRedirectTo,AUTH_CALLBACK_URL);
  error={status:429};assert.equal((await post('/api/auth/resend','mail@example.com')).status,429);
  error={code:'unexpected_failure'};assert.equal((await post('/api/auth/recover','mail@example.com')).status,503);
  error={code:'user_not_found'};assert.deepEqual(await (await post('/api/auth/resend','mail@example.com')).json(),{ok:true});
 }finally{await new Promise(r=>server.close(r));}
});

test('recovery and resend preserve input, show inline feedback and prevent duplicate sends',async()=>{
 const dom=new JSDOM('<div id="product-root"></div>',{url:'http://localhost',runScripts:'outside-only'});
 let sends=0,resolveSend;
 dom.window.fetch=async path=>{
  if(path==='/api/auth/resend'||path==='/api/auth/recover'){sends++;return new Promise(r=>resolveSend=r);}
  return {ok:true,json:async()=>({user:null,projects:[],backend:'supabase'})};
 };
 try{
  const source=readFileSync(new URL('../public/product-app.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  await dom.window.eval(`(async()=>{const setupSearchSuggestions=()=>{},setupSortMenu=()=>{},sortMenu=()=>'';${source}})()`);
  await new Promise(r=>setTimeout(r,20));
  const d=dom.window.document;d.querySelector('[data-action=account]').click();
  const login=d.querySelector('#auth-form');login.querySelector('[name=password]').value='keep-this-password';
  d.querySelector('[data-action=recover-password]').click();
  assert.match(login.querySelector('.form-error').textContent,/正しいメール/);
  assert.equal(login.querySelector('[name=password]').value,'keep-this-password');assert.equal(sends,0);assert.equal(d.querySelector('.success-toast'),null);
  d.querySelector('[data-action=auth-register]').click();
  const form=d.querySelector('#auth-form'),button=d.querySelector('[data-action=resend-confirmation]');
  form.querySelector('[name=email]').value='mail@example.com';form.querySelector('[name=password]').value='keep-this-too';
  button.click();button.click();assert.equal(sends,1);assert.equal(button.disabled,true);
  resolveSend({ok:false,json:async()=>({error:'送信上限です'})});await new Promise(r=>setTimeout(r,20));
  assert.match(form.querySelector('[role=alert]').textContent,/送信上限/);assert.equal(button.disabled,false);
  button.click();resolveSend({ok:true,json:async()=>({ok:true})});await new Promise(r=>setTimeout(r,20));
  assert.equal(sends,2);assert.equal(button.disabled,true);assert.match(button.textContent,/秒/);
  assert.equal(form.querySelector('[name=password]').value,'keep-this-too');assert.equal(form.querySelector('[name=email]').value,'mail@example.com');
  assert.match(form.querySelector('[role=status]').textContent,/確認待ち/);assert.equal(d.querySelector('.success-toast'),null);
 }finally{dom.window.close();}
});
