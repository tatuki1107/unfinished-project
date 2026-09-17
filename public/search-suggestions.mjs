// Delegation keeps the combobox working when the surrounding demo UI renders.
export function setupSearchSuggestions(root, { search, onSelect, delay = 180 }) {
  let timer, generation = 0, items = [], active = -1;
  const input = () => root.querySelector('#project-search');
  const panel = () => root.querySelector('.search-suggestions');
  function close() {
    clearTimeout(timer); generation++; active = -1;
    if (panel()) panel().hidden = true;
    input()?.setAttribute('aria-expanded', 'false');
    input()?.removeAttribute('aria-activedescendant');
  }
  function highlight(index) {
    active = index;
    const options = root.querySelectorAll('[data-search-option]');
    options.forEach((el, i) => el.setAttribute('aria-selected', String(i === active)));
    if (options[active]) {
      input().setAttribute('aria-activedescendant', options[active].id);
      options[active].scrollIntoView?.({block:'nearest'});
    }
  }
  function message(text) {
    panel().hidden = false;
    input().setAttribute('aria-expanded', 'true');
    panel().querySelector('.search-status').textContent = text;
  }
  function schedule() {
    close(); items = [];
    const field = input(), token = generation, q = field.value.trim();
    root.querySelector('#search-options').replaceChildren();
    message(q ? '候補を探しています…' : '最近の作品');
    timer = setTimeout(async () => {
      try {
        const results = await search(q);
        if (token !== generation || input() !== field || !field.isConnected) return;
        items = results.slice(0, 6);
        message(items.length ? (q ? `作品候補 ${items.length}件 · Enterで検索` : '最近の作品 · 入力して絞り込む') : '候補がありません。別の言葉で検索してください。');
        const list = root.querySelector('#search-options');
        items.forEach((project, i) => {
          const option = root.ownerDocument.createElement('div');
          option.id = `search-option-${i}`;
          option.dataset.searchOption = String(i);
          option.setAttribute('role', 'option');
          option.setAttribute('aria-selected', 'false');
          const title = root.ownerDocument.createElement('strong');
          title.textContent = project.title;
          const meta = root.ownerDocument.createElement('span');
          meta.textContent = `${({novel:'小説',music:'音楽',game:'ゲーム企画'})[project.category] || ''} · ${project.authorName}`;
          option.append(title, meta); list.append(option);
        });
      } catch {
        if (token === generation && input() === field) message('候補を取得できませんでした。検索ボタンで再度お試しください。');
      }
    }, delay);
  }
  async function choose(index) {
    const project = items[index]; if (!project) return;
    close();
    try { await onSelect(project); }
    catch { if(panel()) message('作品を開けませんでした。もう一度お試しください。'); }
  }
  root.addEventListener('focusin', e => { if(e.target.id === 'project-search') schedule(); });
  root.addEventListener('input', e => { if(e.target.id === 'project-search' && !e.isComposing) schedule(); });
  root.addEventListener('compositionend', e => { if(e.target.id === 'project-search') schedule(); });
  root.addEventListener('keydown', e => {
    if(e.target.id !== 'project-search' || e.isComposing) return;
    if(e.key === 'Escape') { e.preventDefault(); close(); }
    else if(e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if(panel().hidden) schedule();
      else if(items.length) highlight((active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length);
    } else if(e.key === 'Enter' && active >= 0 && !panel().hidden) { e.preventDefault(); choose(active); }
  });
  root.addEventListener('pointerdown', e => {
    if(e.target.closest('[data-search-option]')) e.preventDefault();
  });
  root.addEventListener('click', e => {
    const option = e.target.closest('[data-search-option]');
    if(option) choose(Number(option.dataset.searchOption));
  });
  root.addEventListener('focusout', e => {
    if(e.target.id === 'project-search' && !e.relatedTarget?.closest('.search-form')) close();
  });
  root.addEventListener('submit', e => { if(e.target.id === 'search-form') close(); });
  root.ownerDocument.addEventListener('pointerdown', e => { if(!e.target.closest('.search-form')) close(); });
}
