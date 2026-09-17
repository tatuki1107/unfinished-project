import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {setupSearchSuggestions} from '../public/search-suggestions.mjs';
const tick = () => new Promise(resolve=>setTimeout(resolve,15));
function fixture(search) {
 const dom=new JSDOM('<main><form class="search-form" id="search-form"><input id="project-search"><div class="search-suggestions" hidden><p class="search-status"></p><div id="search-options"></div></div></form></main>');
 const root=dom.window.document.querySelector('main'); let selected;
 setupSearchSuggestions(root,{search,onSelect:p=>{selected=p;},delay:0});
 return {dom,root,input:root.querySelector('input'),selected:()=>selected};
}
const item={id:'1',title:'海底郵便局',category:'game',authorName:'佐伯'};
test('focus shows suggestions; keyboard chooses and Escape closes',async()=>{
 const f=fixture(async()=>[item]); f.input.focus(); await tick();
 assert.equal(f.input.getAttribute('aria-expanded'),'true');
 assert.match(f.root.textContent,/海底郵便局/);
 f.input.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));
 assert.equal(f.input.getAttribute('aria-activedescendant'),'search-option-0');
 f.input.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
 assert.equal(f.selected().id,'1'); assert.equal(f.input.getAttribute('aria-expanded'),'false');
 f.input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true})); await tick();
 f.input.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
 assert.equal(f.root.querySelector('.search-suggestions').hidden,true); f.dom.window.close();
});
test('stale query results cannot replace newer results and titles are plain text',async()=>{
 const pending=[]; const f=fixture(q=>new Promise(resolve=>pending.push({q,resolve})));
 f.input.focus(); await tick(); f.input.value='海'; f.input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true})); await tick();
 pending[1].resolve([{...item,title:'<img src=x>'}]); await tick(); pending[0].resolve([item]); await tick();
 assert.match(f.root.textContent,/<img src=x>/); assert.equal(f.root.querySelector('img'),null);
 assert.doesNotMatch(f.root.textContent,/海底郵便局/); f.dom.window.close();
});
test('empty and failure states are visible',async()=>{
 let fail=false; const f=fixture(async()=>{if(fail)throw Error('offline');return [];});
 f.input.focus(); await tick(); assert.match(f.root.textContent,/候補がありません/);
 fail=true; f.input.dispatchEvent(new f.dom.window.Event('input',{bubbles:true})); await tick();
 assert.match(f.root.textContent,/取得できません/); f.dom.window.close();
});
