import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {sortMenu,setupSortMenu} from '../public/sort-menu.mjs';
function fixture() {
 const dom=new JSDOM(`<main>${sortMenu('new')}<button id="outside">外</button></main>`);
 const root=dom.window.document.querySelector('main'); const changed=[];
 setupSortMenu(root,async value=>{changed.push(value);root.innerHTML=sortMenu(value);});
 return {dom,root,changed,key:(el,key)=>el.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}))};
}
test('sort menu opens on selected choice; arrows navigate; selection restores focus',async()=>{
 const f=fixture(); f.root.querySelector('#sort').click();
 assert.equal(f.dom.window.document.activeElement.dataset.sortValue,'new');
 f.key(f.dom.window.document.activeElement,'ArrowDown');
 assert.equal(f.dom.window.document.activeElement.dataset.sortValue,'updated');
 f.dom.window.document.activeElement.click(); await Promise.resolve(); await Promise.resolve();
 assert.deepEqual(f.changed,['updated']);
 assert.equal(f.root.querySelector('#sort-menu').hidden,true);
 assert.equal(f.dom.window.document.activeElement.id,'sort');
 assert.equal(f.root.querySelector('[aria-checked=true]').dataset.sortValue,'updated'); f.dom.window.close();
});
test('Escape and outside click close without changing sort',()=>{
 const f=fixture(); const trigger=f.root.querySelector('#sort'); trigger.click();
 f.key(f.dom.window.document.activeElement,'Escape');
 assert.equal(f.dom.window.document.activeElement,trigger);
 assert.equal(f.root.querySelector('#sort-menu').hidden,true);
 trigger.click(); f.root.querySelector('#outside').dispatchEvent(new f.dom.window.Event('pointerdown',{bubbles:true}));
 assert.equal(f.root.querySelector('#sort-menu').hidden,true); assert.deepEqual(f.changed,[]); f.dom.window.close();
});
