const choices = [['new','新着順'], ['updated','更新順'], ['branches','派生が多い順']];

export function sortMenu(value) {
  const label = choices.find(([key])=>key===value)?.[1] || choices[0][1];
  return `<div class="sort-control"><span class="sort-caption">並び替え</span><button type="button" id="sort" class="sort-trigger" aria-label="並び替え: ${label}" aria-haspopup="menu" aria-expanded="false" aria-controls="sort-menu"><span>${label}</span><img src="/icons/caret-down.svg" alt=""></button><div class="sort-menu" id="sort-menu" role="menu" aria-label="並び替え" hidden>${choices.map(([key,text])=>`<button type="button" role="menuitemradio" aria-checked="${key===value}" data-sort-value="${key}" tabindex="-1"><span>${text}</span><img src="/icons/check-circle.svg" alt=""></button>`).join('')}</div></div>`;
}

export function setupSortMenu(root, onChange) {
  let busy = false;
  const trigger = () => root.querySelector('#sort');
  const menu = () => root.querySelector('#sort-menu');
  const options = () => [...root.querySelectorAll('[data-sort-value]')];
  function close(restore = false) {
    if(menu()) menu().hidden = true;
    trigger()?.setAttribute('aria-expanded','false');
    if(restore) trigger()?.focus({preventScroll:true});
  }
  function open(last = false) {
    if(busy || !menu()) return;
    menu().hidden = false;
    trigger().setAttribute('aria-expanded','true');
    const all = options();
    (last ? all.at(-1) : all.find(el=>el.getAttribute('aria-checked')==='true') || all[0])?.focus({preventScroll:true});
  }
  root.addEventListener('click', async e => {
    if(e.target.closest('#sort')) { if(menu().hidden) open(); else close(true); return; }
    const option = e.target.closest('[data-sort-value]');
    if(!option || busy) return;
    const value = option.dataset.sortValue;
    close(true);
    if(option.getAttribute('aria-checked')==='true') return;
    busy = true;
    const button = trigger();
    button?.setAttribute('aria-busy','true');
    try { await onChange(value); }
    finally {
      busy = false;
      trigger()?.removeAttribute('aria-busy');
      const focused=root.ownerDocument.activeElement;
      if(focused===button || focused===root.ownerDocument.body) trigger()?.focus({preventScroll:true});
    }
  });
  root.addEventListener('keydown', e => {
    if(!e.target.closest('.sort-control')) return;
    if(e.key==='Escape') { e.preventDefault(); close(true); return; }
    if(e.key==='Tab') { close(true); return; }
    if(e.target.id==='sort' && ['ArrowDown','ArrowUp'].includes(e.key)) {
      e.preventDefault(); open(e.key==='ArrowUp'); return;
    }
    const all=options(), index=all.indexOf(e.target);
    if(index<0) return;
    let next;
    if(e.key==='ArrowDown') next=(index+1)%all.length;
    if(e.key==='ArrowUp') next=(index+all.length-1)%all.length;
    if(e.key==='Home') next=0;
    if(e.key==='End') next=all.length-1;
    if(next!==undefined) { e.preventDefault(); all[next].focus({preventScroll:true}); }
  });
  root.addEventListener('focusout', e => {
    if(e.target.closest('.sort-control') && !e.relatedTarget?.closest('.sort-control')) close();
  });
  root.ownerDocument.addEventListener('pointerdown', e => {
    if(!e.target.closest('.sort-control')) close();
  });
}
