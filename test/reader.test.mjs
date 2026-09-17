import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const source=readFileSync(new URL('../public/reader.mjs',import.meta.url),'utf8');
const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
test('reader renders escaped body, preserves line breaks and offers reading actions',async()=>{
 const dom=new JSDOM('<main id="reader"></main>',{url:'http://localhost/read.html?id=p1',runScripts:'outside-only'});
 dom.window.fetch=async()=>({ok:true,json:async()=>({project:{id:'p1',title:'物語',category:'novel',authorName:'作者',content:'一行目\n<script>bad</script>',license:'derivatives-ok',summary:'紹介'},branches:[]})});
 dom.window.eval(source);await tick();const d=dom.window.document;
 assert.match(d.querySelector('.reading-body').textContent,/<script>bad<\/script>/);
 assert.equal(d.querySelector('script'),null);
 assert.match(d.querySelector('.primary-link').href,/project=p1&action=branch/);
 d.querySelector('#text-size').click(); assert.equal(d.querySelector('#text-size').getAttribute('aria-pressed'),'true');
 assert.equal(d.title,'物語 ｜ 誰かの未完成プロジェクト');dom.window.close();
});
test('reader handles unavailable content and does not offer forbidden derivatives',async()=>{
 const dom=new JSDOM('<main id="reader"></main>',{url:'http://localhost/read.html?id=p1',runScripts:'outside-only'});
 dom.window.fetch=async()=>({ok:true,json:async()=>({project:{id:'p1',title:'企画',category:'game',content:'',license:'no-derivatives',assetUrl:'javascript:alert(1)'},branches:[]})});
 dom.window.eval(source);await tick(); const d=dom.window.document;
 assert.match(d.querySelector('.reading-body').textContent,/本文はまだ登録されていません/);
 assert.equal(d.querySelector('.primary-link'),null); assert.equal(d.querySelector('.reading-attachment'),null);dom.window.close();
});
test('reader displays a recovery link on request failure',async()=>{
 const dom=new JSDOM('<main id="reader"></main>',{url:'http://localhost/read.html?id=missing',runScripts:'outside-only'});
 dom.window.fetch=async()=>({ok:false,status:404});dom.window.eval(source);await tick();
 assert.match(dom.window.document.querySelector('h1').textContent,/開けませんでした/);dom.window.close();
});
