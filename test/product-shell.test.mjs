import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

test('Neon registration verifies an email code and then uses the established session',async()=>{
 const dom=new JSDOM('<div id="product-root"></div>',{url:'http://localhost',runScripts:'outside-only'});
 let verified=false,submitted;
 dom.window.fetch=async(path,options)=>({ok:true,json:async()=>{
  if(path==='/api/auth/register')return{confirmationRequired:true,user:null};
  if(path==='/api/auth/verify'){submitted=JSON.parse(options.body);verified=true;return{ok:true};}
  return{user:verified?{id:'qa',email:'qa@example.invalid',displayName:'QA'}:null,projects:[],backend:'neon'};
 }});
 try{
  const source=readFileSync(new URL('../public/product-app.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
  await dom.window.eval(`(async()=>{const setupSearchSuggestions=()=>{},setupSortMenu=()=>{},sortMenu=()=>'';${source}})()`);
  await new Promise(r=>setTimeout(r,20));const d=dom.window.document;
  d.querySelector('[data-action=account]').click();d.querySelector('[data-action=auth-register]').click();
  const form=d.querySelector('#auth-form');form.elements.email.value='qa@example.invalid';form.elements.password.value='test-password';
  form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));
  const confirmation=d.querySelector('#confirmation-form');assert.ok(confirmation.elements.otp);assert.equal(confirmation.querySelector('[name=password]'),null);
  confirmation.elements.otp.value='123456';confirmation.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,20));
  assert.equal(submitted.otp,'123456');assert.equal(submitted.email,'qa@example.invalid');assert.equal(d.querySelector('#confirmation-form'),null);assert.match(d.body.textContent,/メール確認が完了/);
 }finally{dom.window.close();}
});

test('registration confirmation is a notice, keeps email and clears password without signing in',async()=>{
 const dom=new JSDOM('<div id="product-root"></div>',{url:'http://localhost',runScripts:'outside-only'});
 dom.window.fetch=async path=>({ok:true,json:async()=>path==='/api/auth/register'?{confirmationRequired:true,user:null}:{user:null,projects:[],backend:'supabase'}});
 try {
   const source=readFileSync(new URL('../public/product-app.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
   await dom.window.eval(`(async()=>{const setupSearchSuggestions=()=>{},setupSortMenu=()=>{},sortMenu=()=>'';${source}})()`);
   await new Promise(r=>setTimeout(r,20));
   const d=dom.window.document;
   d.querySelector('[data-action=account]').click();d.querySelector('[data-action=auth-register]').click();
   const f=d.querySelector('#auth-form');
   f.querySelector('[name=email]').value='registration-test@example.com';f.querySelector('[name=password]').value='test-password';
   f.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
   await new Promise(r=>setTimeout(r,20));
   const waiting=d.querySelector('#confirmation-form'),notice=waiting.querySelector('.form-notice');assert.ok(notice);assert.equal(notice.hidden,false);assert.equal(notice.getAttribute('role'),'status');
   assert.match(notice.textContent,/メール内のリンク/);assert.equal(f.querySelector('[name=password]').value,'');assert.equal(waiting.querySelector('[name=email]').value,'registration-test@example.com');
   assert.equal(d.querySelector('#auth-form'),null);assert.equal(waiting.querySelector('[name=password]'),null);assert.equal(waiting.querySelector('button').disabled,true);assert.equal(d.querySelector('.success-toast'),null);
 } finally {dom.window.close();}
});

test('auth failure stays inside modal, preserves inputs, prevents duplicates and supports retry',async()=>{
 const dom=new JSDOM('<div id="product-root"></div>',{url:'http://localhost',runScripts:'outside-only'});
 let resolveLogin,calls=0;
 dom.window.fetch=async path=>{
   if(path==='/api/auth/login'){calls++;return new Promise(resolve=>{resolveLogin=resolve;});}
   return {ok:true,json:async()=>({user:null,projects:[],backend:'supabase'})};
 };
 try {
   const source=readFileSync(new URL('../public/product-app.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
   await dom.window.eval(`(async()=>{const setupSearchSuggestions=()=>{},setupSortMenu=()=>{},sortMenu=()=>'';${source}})()`);
   await new Promise(r=>setTimeout(r,20));
   const d=dom.window.document;
   d.querySelector('[data-action=account]').click();
   const form=d.querySelector('#auth-form'),email=form.querySelector('[name=email]'),password=form.querySelector('[name=password]'),button=form.querySelector('button');
   email.value='ui-test@example.com';password.value='invalid-test-password';
   const submit=()=>form.dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
   submit();submit();assert.equal(calls,1);assert.equal(button.disabled,true);
   resolveLogin({ok:false,json:async()=>({error:'メールアドレスまたはパスワードが正しくありません。'})});
   await new Promise(r=>setTimeout(r,20));
   const error=form.querySelector('[role=alert]');
   assert.equal(error.hidden,false);assert.equal(d.activeElement,error);
   assert.match(error.textContent,/正しくありません/);assert.equal(error.closest('[role=dialog]')!==null,true);
   assert.equal(email.value,'ui-test@example.com');assert.equal(password.value,'invalid-test-password');
   assert.equal(button.disabled,false);assert.equal(d.querySelector('.success-toast'),null);
   submit();assert.equal(calls,2);assert.equal(error.hidden,true);
   resolveLogin({ok:true,json:async()=>({user:{id:'test',displayName:'テスト'}})});
   await new Promise(r=>setTimeout(r,20));
   assert.equal(d.querySelector('#auth-form'),null);
 } finally {dom.window.close();}
});
test('product mounts inside Javelin shell and dialog restores focus on Escape',async()=>{
 const dom=new JSDOM('<div id="app"><div id="product-root"></div></div>',{url:'http://localhost',runScripts:'outside-only'});
 dom.window.fetch=async()=>({ok:true,json:async()=>({user:null,projects:[],backend:'supabase'})});
 const source=readFileSync(new URL('../public/product-app.mjs',import.meta.url),'utf8').replace(/^import .*;\r?\n/gm,'');
 await dom.window.eval(`(async()=>{const setupSearchSuggestions=()=>{},setupSortMenu=()=>{},sortMenu=()=>'';${source}})()`);
 await new Promise(r=>setTimeout(r,20));
 const d=dom.window.document, shell=d.querySelector('#product-root');
 assert.ok(shell);assert.equal(d.querySelectorAll('header.site-header').length,1);
 shell.querySelector('[data-action=account]').click();
 assert.equal(d.activeElement.getAttribute('aria-label'),'閉じる');
 assert.equal(shell.querySelector('main').inert,true);
 assert.ok(shell.querySelector('[data-action=recover-password]'));
 shell.querySelector('[data-action=auth-register]').click();
 assert.equal(shell.querySelector('#auth-form').dataset.mode,'register');
 assert.equal(shell.querySelector('[data-action=recover-password]'),null);
 shell.querySelector('[data-action=auth-login]').click();
 assert.ok(shell.querySelector('[data-action=recover-password]'));
 d.activeElement.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(shell.querySelector('[role=dialog]'),null);
 assert.equal(d.activeElement.dataset.action,'account');
 assert.equal(shell.querySelector('main').inert,false);dom.window.close();
});
