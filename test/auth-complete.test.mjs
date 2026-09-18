import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {completeEmailAuth} from '../public/auth-complete.mjs';

const html=readFileSync(new URL('../public/auth-complete.html',import.meta.url),'utf8');
async function run(hash,fetch){
 const dom=new JSDOM(html,{url:'https://example.com/auth-complete.html'+hash});let destination=null,timer=null;
 await completeEmailAuth({document:dom.window.document,location:dom.window.location,history:dom.window.history,fetch,redirect:url=>destination=url,schedule:fn=>timer=fn});
 return {dom,document:dom.window.document,get destination(){return destination;},advance:()=>timer?.()};
}
test('valid confirmation establishes cookie session, removes tokens and redirects to fixed home',async()=>{
 const requests=[];const r=await run('#access_token=test-access&refresh_token=test-refresh&type=signup&next=https://evil.example',async(path,options)=>{requests.push({path,options});return {ok:true,json:async()=>({user:{id:'user-1'}})};});
 assert.equal(r.dom.window.location.hash,'');assert.equal(requests[0].path,'/api/auth/session');assert.deepEqual(JSON.parse(requests[0].options.body),{access_token:'test-access',refresh_token:'test-refresh'});
 assert.equal(requests[1].path,'/api/session');assert.match(r.document.querySelector('h1').textContent,/登録が完了/);assert.equal(r.destination,null);r.advance();assert.equal(r.destination,'/');r.dom.window.close();
});
test('recovery opens password screen, not the normal home flow',async()=>{
 const r=await run('#access_token=a&refresh_token=b&type=recovery',async()=>({ok:true,json:async()=>({user:{id:'u'}})}));r.advance();assert.equal(r.destination,'/?auth=recovery');r.dom.window.close();
});
test('expired, used and missing links show resend and login without network or redirect',async()=>{
 for(const hash of ['','#error=access_denied&error_code=otp_expired','#access_token=partial']){
  const r=await run(hash,()=>{throw Error('unexpected fetch');});assert.equal(r.dom.window.location.hash,'');assert.equal(r.document.querySelector('#auth-actions').hidden,false);assert.equal(r.document.querySelector('.auth-card').dataset.status,'error');r.advance();assert.equal(r.destination,null);r.dom.window.close();
 }
});
test('server rejection, missing cookie and network failures never claim login success',async()=>{
 for(const fetch of [async()=>({ok:false,json:async()=>({error:'failed'})}),async path=>({ok:true,json:async()=>({user:path==='/api/session'?null:{id:'u'}})}),async()=>{throw Error('offline');}]){
  const r=await run('#access_token=a&refresh_token=b',fetch);assert.equal(r.document.querySelector('.auth-card').dataset.status,'error');r.advance();assert.equal(r.destination,null);r.dom.window.close();
 }
});
