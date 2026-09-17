const root=document.querySelector('#reader');
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const href=id=>`/read.html?id=${encodeURIComponent(id)}`;
const safeAsset=value=>{try{const url=new URL(value,location.origin);return url.origin===location.origin&&url.pathname.startsWith('/uploads/')?url.href:null;}catch{return null;}};
async function load(){
 const id=new URLSearchParams(location.search).get('id');
 if(!id)throw Error('作品が指定されていません。作品一覧から読みたい作品を選んでください。');
 const response=await fetch(`/api/projects/${encodeURIComponent(id)}`,{credentials:'same-origin'});
 if(!response.ok)throw Error(response.status===404?'作品が見つからないか、閲覧できない作品です。':'作品を読み込めませんでした。時間をおいて再度お試しください。');
 const {project:p,branches}=await response.json();
 document.title=`${p.title} ｜ 誰かの未完成プロジェクト`;
 const asset=p.assetUrl?safeAsset(p.assetUrl):null;
 let external=null;try{const u=new URL(p.externalUrl);if(u.protocol==='https:'&&!u.username&&!u.password)external=u;}catch{}
 const direct=branches.filter(b=>b.parentId===p.id);
 root.innerHTML=`<article><header class="reading-heading"><p class="reading-category">${esc(({novel:'小説',music:'音楽',game:'ゲーム企画'})[p.category])} <span>制作途中の作品</span></p><h1>${esc(p.title)}</h1><p class="reading-author">${esc(p.authorName)}${p.progress?` <span>／ ${esc(p.progress)}</span>`:''}</p>${p.parentId?`<a class="parent-link" href="${href(p.parentId)}">派生元の作品を読む</a>`:''}<p class="reading-summary">${esc(p.summary)}</p></header>
 <section aria-labelledby="body-title"><div class="reading-toolbar"><h2 id="body-title">${p.category==='novel'?'本文・公開テキスト':p.category==='music'?'作品・制作メモ':'企画・公開テキスト'}</h2><button type="button" id="text-size" aria-pressed="false">文字を大きく</button></div><div class="reading-body">${p.content?.trim()?esc(p.content):'<p class="reading-empty">本文はまだ登録されていません。添付作品がある場合は、下から開けます。</p>'}</div></section>
 ${asset?`<section class="reading-attachment" aria-labelledby="attachment-title"><h2 id="attachment-title">添付作品</h2>${/^audio\/(mpeg|mp3|wav|ogg|mp4|webm)$/.test(p.assetType||'')?`<audio controls preload="metadata" src="${esc(asset)}" aria-label="${esc(p.assetName||p.title)}"></audio>`:''}<a href="${esc(asset)}" target="_blank" rel="noopener">${esc(p.assetName||'添付ファイルを開く')} <span>（別タブで開く）</span></a></section>`:''}
 ${external?`<section class="reading-attachment"><h2>外部サイトの作品</h2><p>${esc(external.hostname)}</p><a href="${esc(external.href)}" target="_blank" rel="noopener noreferrer">外部の作品を開く（別タブ）</a><p>外部サイトの公開設定・利用条件が適用されます。</p></section>`:''}
 ${p.authorNote?.trim()?`<section class="reading-attachment"><h2>作者メモ・続きを託したい部分</h2><p class="author-note">${esc(p.authorNote)}</p></section>`:''}
 <p class="reading-end">ここまでが、現在公開されている内容です。</p>
 <section class="reading-next"><p class="section-index">読んだ、その先へ</p><h2>この作品から、何が生まれる？</h2><p>${p.license==='no-derivatives'?'この作品は派生作品の制作を許可していません。':'あなたの続きを、新しい枝として残せます。'}</p><p class="reading-terms">${esc(p.attribution||'作者が指定した派生条件を確認してください。')}</p>${p.license!=='no-derivatives'?`<a class="primary-link" href="/?project=${encodeURIComponent(p.id)}&action=branch">この続きをつくる</a>`:''}<a class="discussion-link" href="/?project=${encodeURIComponent(p.id)}">感想・派生ツリーを見る</a></section>
 ${direct.length?`<section class="reading-branches"><h2>この作品から生まれた続き</h2><ul>${direct.map(b=>`<li><a href="${href(b.id)}"><strong>${esc(b.title)}</strong><span>${esc(b.authorName)} · 続きを読む →</span></a></li>`).join('')}</ul></section>`:''}</article><footer><a href="/#feed-title">作品一覧へ戻る</a><a href="#reader">本文の先頭へ</a></footer>`;
 root.querySelector('#text-size').addEventListener('click',event=>{const large=root.classList.toggle('large-text');event.currentTarget.setAttribute('aria-pressed',String(large));event.currentTarget.textContent=large?'文字を標準に戻す':'文字を大きく';});
}
load().catch(error=>{root.innerHTML=`<section class="reading-error"><h1>作品を開けませんでした</h1><p>${esc(error.message)}</p><a class="primary-link" href="/#feed-title">作品一覧へ戻る</a></section>`;});
