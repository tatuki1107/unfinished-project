import { setupSearchSuggestions } from './search-suggestions.mjs';
import { sortMenu, setupSortMenu } from './sort-menu.mjs';
const root = await new Promise(resolve=>{const found=document.querySelector('#product-root');if(found)return resolve(found);const observer=new MutationObserver(()=>{const node=document.querySelector('#product-root');if(node){observer.disconnect();resolve(node);}});observer.observe(document.querySelector('#app'),{childList:true,subtree:true});});
const icons = name => `/icons/${name}.svg`;
const artByCategory = { novel:"/art/rain-novel.png", music:"/art/four-am-blue.png", game:"/art/underwater-post.png" };
const labels = { novel:"小説", music:"音楽", game:"ゲーム企画" };
const state = { user:null, projects:[], selectedId:null, detail:null, category:"all", q:"", sort:"new", modal:null, notice:"", notifications:[] };

const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[c]);
const dateText = value => { const text=String(value).replace(' ','T'); return new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric'}).format(new Date(/[zZ]|[+-]\d\d:\d\d$/.test(text)?text:text+'Z')); };

async function api(path, options={}) {
  const response = await fetch(path,{ credentials:"same-origin", headers:{"content-type":"application/json",...(options.headers||{})}, ...options });
  const payload = await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(payload.error||"操作に失敗しました");
  return payload;
}

async function boot() {
  const hash=new URLSearchParams(location.hash.slice(1));
  const recovery=hash.get('type')==='recovery';
  if(hash.has('access_token')) {
    const tokens={access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token')};
    history.replaceState(null,'',location.pathname+location.search);
    await api('/api/auth/session',{method:'POST',body:JSON.stringify(tokens)});
  }
  const session = await api("/api/session"); state.user=session.user; state.backend=session.backend;
  await loadProjects();
  const params=new URLSearchParams(location.search);
  if(params.get('project')) {
    state.selectedId=params.get('project'); await loadDetail();
    if(params.get('action')==='branch' && state.detail.project.license!=='no-derivatives') {
      state.returnToBranch=true; state.modal=state.user?'branch':'auth';
    }
  }
  render();
  if(recovery&&state.user){state.modal='password';render();}
  if(params.get('project')&&!state.modal) root.querySelector('.detail-panel')?.scrollIntoView({block:'start'});
}

let projectsRequest = 0;
async function loadProjects(selectId) {
  const request = ++projectsRequest;
  const query = new URLSearchParams({category:state.category,sort:state.sort}); if(state.q) query.set("q",state.q);
  const data=await api(`/api/projects?${query}`);
  let selectedId=selectId||state.selectedId||data.projects[0]?.id||null;
  if(!data.projects.some(p=>p.id===selectedId)) selectedId=data.projects[0]?.id||null;
  const detail=selectedId ? await api(`/api/projects/${encodeURIComponent(selectedId)}`) : null;
  if(request!==projectsRequest) return;
  state.projects=data.projects; state.selectedId=selectedId; state.detail=detail;
}

async function loadDetail() {
  state.detail=state.selectedId ? await api(`/api/projects/${encodeURIComponent(state.selectedId)}`) : null;
}

function header() {
  const unread=state.notifications.filter(n=>!n.is_read).length;
  return `<header class="site-header"><div class="header-inner">
    <a class="brand-link" href="#top" aria-label="誰かの未完成プロジェクト ホーム"><img class="brand-logo" src="/brand/unfinished-project-logo.png" alt="誰かの未完成プロジェクト"><img class="brand-symbol" src="/brand/unfinished-project-symbol.png" alt=""></a>
    <nav class="header-nav" aria-label="メインナビゲーション"><a href="#feed-title">作品を探す</a><button class="nav-link" data-action="focus-search">検索</button><a href="/about.html">このプロジェクトについて</a></nav>
    <div class="header-actions"><button class="icon-button notification-trigger" data-action="notifications" aria-label="通知"><img src="${icons("bell")}" alt="">${unread?`<b>${unread}</b>`:""}</button>
      <button class="primary-button header-cta" data-action="new-project" aria-label="未完成を置く"><img src="${icons("plus")}" alt=""><span>未完成を置く</span></button>
      ${state.user?`<button class="avatar-button" data-action="account" aria-label="${esc(state.user.displayName)}のアカウント" title="${esc(state.user.displayName)}のアカウント">${esc(state.user.displayName?.slice(0,1)||'ア')}</button>`:`<button class="login-trigger" data-action="account">ログイン / 新規登録</button>`}</div>
  </div></header>`;
}

function intro() {
  return `<section class="intro" id="top"><div class="intro-copy-block"><p class="kicker">OPEN CREATIVE PROJECTS</p><h1>続きを、待っている作品。</h1><p class="intro-copy">誰かが途中で置いた物語や音楽、ゲームのアイデア。気になる作品を見つけて、あなたの枝を伸ばそう。</p></div>
  <div id="about" class="intro-art"><img src="/art/hero-collage.png" alt="青空と電線を切り取ったコラージュ"><p class="intro-note">未完成は、誰かのはじまり。</p><p class="intro-art-caption">きっと、どこかでつながっている。</p></div></section>`;
}

function filters() {
  const values=[["all","leaf","すべて"],["novel","pen-nib","小説"],["music","music-notes","音楽"],["game","game-controller","ゲーム企画"]];
  return `<div class="discovery-tools"><form class="search-form" id="search-form" autocomplete="off"><img src="${icons("magnifying-glass")}" alt=""><input id="project-search" name="q" value="${esc(state.q)}" placeholder="作品名、作者、キーワードで検索" aria-label="作品名、作者、キーワードで検索" role="combobox" aria-autocomplete="list" aria-controls="search-options" aria-expanded="false" autocomplete="off"><button>検索</button><div class="search-suggestions" hidden><p class="search-status" role="status"></p><div id="search-options" role="listbox" aria-label="作品候補"></div></div></form>
  <div class="filter-bar"><div class="filter-scroll">${values.map(([id,icon,label])=>`<button class="filter-chip ${id} ${state.category===id?"active":""}" data-category="${id}" aria-pressed="${state.category===id}"><span class="filter-icon"><img src="${icons(icon)}" alt=""></span><span>${label}</span></button>`).join("")}</div>
  ${sortMenu(state.sort)}</div></div>`;
}

function projectCard(p) {
  return `<article class="card-wrap"><button class="project-card ${esc(p.category)} ${p.id===state.selectedId?"selected":""}" data-project="${esc(p.id)}" aria-pressed="${p.id===state.selectedId}">
    <span class="project-visual"><img src="${esc(p.coverUrl||artByCategory[p.category])}" alt="${esc(p.title)}の作品画像"></span><span class="project-content"><span class="project-meta"><span class="category-label">${labels[p.category]}</span><span class="updated">${dateText(p.updatedAt)}</span></span>
    <span class="project-title">${esc(p.title)}</span><span class="project-excerpt">${esc(p.summary)}</span><span class="project-footer"><span class="author"><span class="mini-avatar ${p.category==='music'?'pink':p.category==='game'?'yellow':'blue'}">${esc(p.authorName.slice(0,1))}</span><span>${esc(p.authorName)}</span></span>
    <span class="branch-count"><img src="${icons("git-fork")}" alt=""><strong>${p.branchCount}</strong><span class="branch-label">本の派生</span><span class="branch-unit">本</span></span></span></span></button><a class="card-read-link" href="/read.html?id=${encodeURIComponent(p.id)}" aria-label="${esc(p.title)}：${p.category==='novel'?'本文を読む':p.category==='music'?'音源・作品を見る':'企画を読む'}">${p.category==='novel'?'本文を読む':p.category==='music'?'音源・作品を見る':'企画を読む'} <img src="${icons('arrow-right')}" alt=""></a></article>`;
}

function branchTree(project, branches) {
  const direct=branches.filter(b=>b.parentId===project.id);
  return `<div class="tree"><div class="tree-root-card"><img src="${esc(project.coverUrl||artByCategory[project.category])}" alt=""><div><strong>${esc(project.title)}</strong><p>原案 / ${esc(project.authorName)}</p></div></div>
    <div class="tree-children">${direct.map((b,i)=>`<button class="tree-node branch-${["green","pink","blue"][i%3]}" data-project="${esc(b.id)}"><span class="tree-avatar"><img src="${icons(b.category==='music'?'music-notes':b.category==='game'?'game-controller':'file-text')}" alt=""></span><span><strong>${esc(b.title)}</strong><p>${esc(b.authorName)} ・ ${b.branchCount}本の枝</p></span></button>`).join("")||`<p class="empty-branch">最初の枝を待っています。</p>`}</div>
    <button class="tree-add" data-action="new-branch">＋ この先に、あなたの続きが待っています</button></div>`;
}

function detail() {
  if(!state.detail) return `<aside class="detail-panel"><div class="empty-state"><h2>作品が見つかりません</h2><p>検索条件を変えてみてください。</p></div></aside>`;
  const {project:p,branches,comments,canEdit}=state.detail;
  const asset=p.assetUrl?`<a class="asset-link" href="${esc(p.assetUrl)}" target="_blank" rel="noopener"><img src="${icons("file-text")}" alt="">${esc(p.assetName||"添付ファイルを開く")}</a>`:"";
  return `<aside class="detail-panel" aria-label="選択中の作品"><div class="detail-card ${p.category}"><div class="detail-hero"><div><span class="detail-type">${labels[p.category]}</span><h2>${esc(p.title)}</h2><p class="detail-progress">作者 ${esc(p.authorName)} ｜ ${esc(p.progress||"制作途中")}</p></div>
    <button class="bookmark-button ${p.bookmarked?"active":""}" data-action="bookmark" aria-label="ブックマーク"><img src="${icons("bookmark-simple")}" alt=""></button></div>
    <p class="detail-copy">${esc(p.summary)}</p><a class="detail-read-link" href="/read.html?id=${encodeURIComponent(p.id)}">${p.category==='novel'?'本文を読む':p.category==='music'?'音源・作品を見る':'企画を読む'} <img src="${icons('arrow-right')}" alt=""></a>${asset}<div class="permission"><img src="${icons("check-circle")}" alt=""><div><strong>${p.license==="no-derivatives"?"派生不可":"派生・改変OK"}</strong><p>${esc(p.attribution||"派生元を表記してください")}</p></div></div>
    <div class="detail-actions"><button class="primary-button fork-button" data-action="new-branch" ${p.license==="no-derivatives"?"disabled":""}><img src="${icons("git-fork")}" alt=""><span>この続きをつくる</span><img class="button-arrow" src="${icons("arrow-right")}" alt=""></button>${canEdit?`<button class="secondary-button" data-action="edit-project">編集</button><button class="danger-link" data-action="delete-project">削除</button>`:`<button class="subtle-button" data-action="report">通報</button>`}</div>
    <div class="lineage-header"><div><h3>派生ツリー</h3><p>この作品から生まれた続き</p></div><span>${branches.length}作品</span></div>${branchTree(p,branches)}
    <section class="comments"><div class="comments-head"><h3>コメント</h3><span>${comments.length}</span></div>${comments.map(c=>`<article><strong>${esc(c.authorName)}</strong><time>${dateText(c.createdAt)}</time><p>${esc(c.body)}</p></article>`).join("")||`<p class="empty-copy">まだコメントはありません。</p>`}
    <form id="comment-form"><textarea name="body" placeholder="作品への感想や相談を書く" required></textarea><button class="secondary-button">コメントする</button></form></section></div></aside>`;
}

function main() {
  return `<main class="page">${intro()}${filters()}<div class="content-grid"><section class="feed" aria-labelledby="feed-title"><div class="section-heading"><div><h2 id="feed-title">新しく置かれた作品</h2><p>${state.projects.length}件</p></div><button class="text-link" data-action="refresh">更新する <img src="${icons("arrow-right")}" alt=""></button></div><div class="project-list">${state.projects.map(projectCard).join("")||`<div class="empty-state"><h3>作品がありません</h3><p>検索条件を変えるか、最初の作品を置いてみてください。</p></div>`}</div></section>${detail()}</div></main>`;
}

function authModal(mode="login") {
  return `<div class="modal-backdrop"><section class="composer auth-modal" role="dialog" aria-modal="true" aria-label="ログイン"><div class="composer-head"><div><span class="modal-icon"><img src="${icons("users")}" alt=""></span><div><p class="kicker">MEMBER</p><h2>${mode==="register"?"アカウントを作る":"ログイン"}</h2></div></div><button class="close-button" aria-label="閉じる" data-action="close-modal"><img src="${icons("x")}" alt=""></button></div>
  <div class="auth-switch"><button data-action="auth-login" class="${mode==="login"?"active":""}">ログイン</button><button data-action="auth-register" class="${mode==="register"?"active":""}">新規登録</button></div>
  <form id="auth-form" data-mode="${mode}">${mode==="register"?`<label>表示名<input name="displayName" required maxlength="60" autocomplete="nickname"></label>`:""}<label>メール<input type="email" name="email" required autocomplete="email" value=""></label><label>パスワード<input type="password" name="password" minlength="8" maxlength="128" required autocomplete="${mode==="register"?"new-password":"current-password"}" value=""></label><p class="form-error" role="alert" tabindex="-1" hidden></p><button class="primary-button">${mode==="register"?"登録して始める":"ログイン"}</button></form>
  ${state.backend==='supabase'&&mode==='login'?'<button type="button" class="subtle-button" data-action="recover-password">パスワードを忘れた方</button>':''}</section></div>`;
}

function projectModal(branch=false,editing=false) {
  const p=editing?state.detail?.project:null;
  return `<div class="modal-backdrop"><section class="composer project-editor" role="dialog" aria-modal="true" aria-label="${branch?"続きを作る":editing?"作品を編集":"未完成を置く"}"><div class="composer-head"><div><span class="modal-icon"><img src="${icons(branch?"git-fork":"books")}" alt=""></span><div><p class="kicker">${branch?"NEW BRANCH":editing?"EDIT PROJECT":"NEW PROJECT"}</p><h2>${branch?"続きを置く":editing?"作品を編集":"未完成を置く"}</h2></div></div><button class="close-button" aria-label="閉じる" data-action="close-modal"><img src="${icons("x")}" alt=""></button></div>
  <form id="project-form" data-branch="${branch}" data-editing="${editing}"><div class="form-grid"><label>カテゴリ<select name="category"><option value="novel" ${p?.category==="novel"?"selected":""}>小説</option><option value="music" ${p?.category==="music"?"selected":""}>音楽</option><option value="game" ${(p?.category==="game"||(!p&&state.detail?.project.category==="game"))?"selected":""}>ゲーム企画</option></select></label><label>公開範囲<select name="visibility"><option value="public" ${p?.visibility==='public'?'selected':''}>公開</option><option value="unlisted" ${p?.visibility==='unlisted'?'selected':''}>限定公開</option><option value="private" ${p?.visibility==='private'?'selected':''}>非公開</option></select></label></div>
  <label>タイトル<input name="title" required maxlength="140" value="${esc(p?.title||"")}"></label><label>短い紹介<textarea name="summary" required maxlength="500">${esc(p?.summary||"")}</textarea></label><label>作品の本文<textarea name="content" maxlength="20000" placeholder="読者に読んでもらう作品の本文">${esc(p?.content||"")}</textarea><small>本文ページに表示されます。20,000文字以内。</small></label><label>作者メモ・続きを託したい部分<textarea name="authorNote" maxlength="5000" placeholder="制作状況や、続きをつくる人へのメッセージ">${esc(p?.authorNote||"")}</textarea><small>本文とは別に表示されます。5,000文字以内。</small></label>
  <label>TXTから本文を取り込む（任意）<input type="file" name="importText" accept=".txt,text/plain"><small>UTF-8・20,000文字以内。入力済みの本文を置き換える前に確認します。添付とは別の操作です。</small></label>
  <div class="form-grid"><label>進捗<input name="progress" maxlength="120" value="${esc(p?.progress||"")}" placeholder="例: 第3章 / 18ページ"></label><label>派生条件<select name="license"><option value="derivatives-ok">派生・改変OK</option><option value="no-derivatives" ${p?.license==='no-derivatives'?'selected':''}>派生不可</option></select></label></div><label>作者表記など<input name="attribution" maxlength="300" value="${esc(p?.attribution||"")}" placeholder="派生元と作者名を記載してください"></label>
  <div class="form-grid"><label>カバー画像<input type="file" name="cover" accept=".png,.jpg,.jpeg,.webp"><small>PNG・JPEG・WebP／1点・最大6MiB</small></label><label>作品ファイル<input type="file" name="upload" accept=".png,.jpg,.jpeg,.webp,.mp3,.wav,.ogg,.pdf,.txt,.json"><small>PNG・JPEG・WebP、MP3・WAV・OGG、PDF・TXT・JSON／1点・最大6MiB。TXT・JSONはUTF-8。PDFはダウンロードして閲覧します。</small>${p?.assetName?`<small>現在：${esc(p.assetName)}（選択しなければ維持）</small>`:''}</label></div>
  <label>外部の作品URL（任意）<input type="url" name="externalUrl" maxlength="2048" placeholder="https://…" value="${esc(p?.externalUrl||'')}"><small>YouTube・SoundCloud・GitHubなどの公開HTTPSリンク。別タブで開きます。外部サイトの公開範囲は、この作品の設定では変更されません。</small></label><p class="upload-help">限定公開はリンクを知る人が閲覧できます。非公開・下書きの添付は作者と管理者のみ閲覧できます。既にダウンロードされたファイルは回収できません。</p><p class="form-error" role="alert" hidden></p><label class="draft-check"><input type="checkbox" name="draft" ${p?.status==="draft"?"checked":""}> 下書きとして保存</label><button class="primary-button save-button">保存する</button></form></section></div>`;
}

function accountModal() {
  if(!state.user) return authModal();
  return `<div class="modal-backdrop"><section class="composer account-panel"><div class="composer-head"><div><span class="modal-icon"><img src="${icons("users")}" alt=""></span><div><p class="kicker">ACCOUNT</p><h2>${esc(state.user.displayName)}</h2></div></div><button class="close-button" aria-label="閉じる" data-action="close-modal"><img src="${icons("x")}" alt=""></button></div><p>${esc(state.user.email)}</p><p class="profile-bio">${esc(state.user.bio||"プロフィールはまだありません。")}</p>
  <div class="account-actions"><button class="secondary-button" data-action="profile-edit">プロフィール編集</button><button class="secondary-button" data-action="my-projects">自分の作品</button><button class="secondary-button" data-action="bookmarks-panel">ブックマーク</button>${state.user.role==="admin"?`<button class="secondary-button" data-action="admin-reports">通報管理</button>`:""}<button class="danger-link" data-action="logout">ログアウト</button></div></section></div>`;
}

function profileModal() { return `<div class="modal-backdrop"><section class="composer"><div class="composer-head"><h2>プロフィール編集</h2><button class="close-button" aria-label="閉じる" data-action="close-modal"><img src="${icons("x")}" alt=""></button></div><form id="profile-form"><label>表示名<input name="displayName" required maxlength="60" value="${esc(state.user.displayName)}"></label><label>自己紹介<textarea name="bio" maxlength="500">${esc(state.user.bio||"")}</textarea></label><button class="primary-button">保存</button></form></section></div>`; }

function reportModal() { return `<div class="modal-backdrop"><section class="composer"><div class="composer-head"><h2>作品を通報</h2><button class="close-button" aria-label="閉じる" data-action="close-modal"><img src="${icons("x")}" alt=""></button></div><form id="report-form"><label>理由<select name="reason"><option>権利侵害</option><option>嫌がらせ・差別</option><option>スパム</option><option>危険な内容</option><option>その他</option></select></label><label>詳細<textarea name="detail" maxlength="1000"></textarea></label><button class="primary-button">運営へ送る</button></form></section></div>`; }

function notificationsModal() {
  if(!state.user) return authModal();
  return `<div class="modal-backdrop"><section class="composer list-panel"><div class="composer-head"><h2>通知</h2><button class="close-button" aria-label="閉じる" data-action="close-modal"><img src="${icons("x")}" alt=""></button></div>${state.notifications.map(n=>`<button class="notice-row ${n.is_read?"":"unread"}" data-notice-project="${esc(n.project_id||"")}"><strong>${esc(n.message)}</strong><time>${dateText(n.created_at)}</time></button>`).join("")||`<p class="empty-copy">通知はありません。</p>`}<button class="subtle-button" data-action="notifications-read">すべて既読</button></section></div>`;
}

function collectionModal(title,projects) { return `<div class="modal-backdrop"><section class="composer list-panel"><div class="composer-head"><h2>${esc(title)}</h2><button class="close-button" aria-label="閉じる" data-action="close-modal"><img src="${icons("x")}" alt=""></button></div><div class="compact-list">${projects.map(p=>`<button data-project-from-modal="${esc(p.id)}"><img src="${esc(p.coverUrl||artByCategory[p.category])}" alt=""><span><b>${esc(p.title)}</b><small>${labels[p.category]} ・ ${esc(p.status||"公開")}</small></span></button>`).join("")||`<p class="empty-copy">まだありません。</p>`}</div></section></div>`; }

function adminModal(reports) { return `<div class="modal-backdrop"><section class="composer admin-panel"><div class="composer-head"><h2>通報管理</h2><button class="close-button" aria-label="閉じる" data-action="close-modal"><img src="${icons("x")}" alt=""></button></div><div class="report-list">${reports.map(r=>`<article><div><strong>${esc(r.title)}</strong><p>${esc(r.reason)} / ${esc(r.reporter_name)}</p><small>${esc(r.detail)}</small></div><select data-report="${esc(r.id)}"><option value="open" ${r.status==="open"?"selected":""}>未対応</option><option value="reviewing" ${r.status==="reviewing"?"selected":""}>確認中</option><option value="resolved" ${r.status==="resolved"?"selected":""}>対応済み</option><option value="dismissed" ${r.status==="dismissed"?"selected":""}>問題なし</option></select></article>`).join("")||`<p class="empty-copy">通報はありません。</p>`}</div></section></div>`; }

let dialogWasOpen=false, dialogReturnAction='account';
root.addEventListener('click',event=>{if(!state.modal){const button=event.target.closest('[data-action]');if(button)dialogReturnAction=button.dataset.action;}},true);
function syncDialog(){
 const dialog=root.querySelector('.modal-backdrop>.composer');
 root.querySelectorAll('.site-header,main.page').forEach(el=>{el.inert=Boolean(dialog);});
 if(dialog){
   dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');dialog.tabIndex=-1;
   dialog.setAttribute('aria-label',dialog.querySelector('h2')?.textContent||'ダイアログ');
   (dialog.querySelector('input:not([type=file]),textarea,select,button')||dialog).focus({preventScroll:true});
 }else if(dialogWasOpen){
   [...root.querySelectorAll('[data-action]')].find(el=>el.dataset.action===dialogReturnAction)?.focus({preventScroll:true});
 }
 dialogWasOpen=Boolean(dialog);
}
root.addEventListener('keydown',event=>{
 const dialog=root.querySelector('.modal-backdrop>.composer');if(!dialog)return;
 if(event.key==='Escape'){
   if(dialog.querySelector('[data-saving]'))return;
   event.preventDefault();state.modal=null;state.returnToBranch=false;render();return;
 }
 if(event.key==='Tab'){
   const nodes=[...dialog.querySelectorAll('button,a[href],input,textarea,select,[tabindex="0"]')].filter(el=>!el.disabled&&el.getClientRects().length);
   const first=nodes[0],last=nodes.at(-1);
   if(!first){event.preventDefault();dialog.focus();}
   else if(event.shiftKey&&(document.activeElement===first||document.activeElement===dialog)){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 }
});
function modal() {
  if(!state.modal) return "";
  if(state.modal==='password')return `<div class="modal-backdrop"><section class="composer auth-modal" role="dialog" aria-modal="true" aria-label="パスワードの変更"><div class="composer-head"><h2>パスワードの変更</h2><button class="close-button" aria-label="閉じる" data-action="close-modal">×</button></div><form id="password-form"><label>新しいパスワード<input name="password" type="password" required minlength="8" maxlength="128" autocomplete="new-password"></label><p class="form-error" role="alert" hidden></p><button class="primary-button">変更する</button></form></section></div>`;
  if(state.modal==="auth") return authModal(); if(state.modal==="register") return authModal("register"); if(state.modal==="account") return accountModal();
  if(state.modal==="new") return projectModal(false,false); if(state.modal==="branch") return projectModal(true,false); if(state.modal==="edit") return projectModal(false,true);
  if(state.modal==="profile") return profileModal(); if(state.modal==="report") return reportModal(); if(state.modal==="notifications") return notificationsModal();
  if(state.modal.type==="collection") return collectionModal(state.modal.title,state.modal.projects); if(state.modal.type==="admin") return adminModal(state.modal.reports);
  return "";
}

function render() { const filterScroll=root.querySelector('.filter-scroll')?.scrollLeft||0; root.innerHTML=`<div class="app-shell">${header()}${main()}${state.notice?`<div class="success-toast" role="status"><img src="${icons("check-circle")}" alt=""><div><strong>${esc(state.notice)}</strong></div><button data-action="dismiss-notice"><img src="${icons("x")}" alt=""></button></div>`:""}${modal()}</div>`; const filters=root.querySelector('.filter-scroll'); if(filters) filters.scrollLeft=filterScroll; syncDialog(); }
function flash(message) { state.notice=message; render(); setTimeout(()=>{ if(state.notice===message){state.notice="";root.querySelector('.success-toast')?.remove();}},3500); }
function formError(form,message) { const box=form?.querySelector('.form-error'); if(!box){flash(message);return;} box.hidden=false;box.textContent=message;box.tabIndex=-1;box.focus({preventScroll:true});box.scrollIntoView?.({block:'nearest'}); }
function needAuth() { if(state.user) return true; state.modal="auth"; render(); return false; }

async function fileValue(file,kind='asset') { if(!file?.name) return null; if(!file.size) throw new Error('空のファイルは登録できません'); if(file.size>6*1024*1024) throw new Error("ファイルは6MiB以下にしてください");
  if(state.backend==='supabase') {
    const signed=await api('/api/uploads/sign',{method:'POST',body:JSON.stringify({name:file.name,size:file.size,kind})});
    const response=await fetch(signed.url,{method:'PUT',headers:{'content-type':signed.type,'x-upsert':'false'},body:file});
    if(!response.ok)throw new Error('ファイルのアップロードに失敗しました');
    return api(`/api/uploads/${signed.id}/verify`,{method:'POST',body:'{}'});
  }
  return await new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve({name:file.name,type:file.type||"application/octet-stream",data:reader.result}); reader.onerror=()=>reject(new Error('ファイルを読み込めませんでした')); reader.readAsDataURL(file); }); }
async function formProject(form) { const data=new FormData(form); return {authorNote:data.get('authorNote'),externalUrl:data.get('externalUrl'),category:data.get("category"),visibility:data.get("visibility"),title:data.get("title"),summary:data.get("summary"),content:data.get("content"),progress:data.get("progress"),license:data.get("license"),attribution:data.get("attribution"),status:data.get("draft")?"draft":"published",cover:await fileValue(data.get("cover"),'cover'),upload:await fileValue(data.get("upload"))}; }

root.addEventListener("click",async event=>{
  const button=event.target.closest("button,a"); if(!button) return;
  try {
    if(button.dataset.category){ state.category=button.dataset.category; await loadProjects(); render(); return; }
    if(button.dataset.project){ state.selectedId=button.dataset.project; await loadDetail(); render(); return; }
    if(button.dataset.projectFromModal){ state.modal=null; state.selectedId=button.dataset.projectFromModal; await loadDetail(); render(); return; }
    if(button.dataset.noticeProject){ state.modal=null; state.selectedId=button.dataset.noticeProject; await loadDetail(); render(); return; }
    const action=button.dataset.action; if(!action) return;
    if(action==='recover-password'){const email=root.querySelector('#auth-form [name=email]')?.value;if(!email){flash('メールアドレスを入力してから押してください');return;}await api('/api/auth/recover',{method:'POST',body:JSON.stringify({email})});flash('対象のアカウントがある場合、再設定メールを送信します');return;}
    if(action==="focus-search"){ document.querySelector("#project-search")?.focus(); return; }
    if(action==="close-modal"){ state.modal=null; state.returnToBranch=false; render(); return; }
    if(action==="dismiss-notice"){ state.notice=""; render(); return; }
    if(action==="auth-login"){ state.modal="auth"; render(); return; } if(action==="auth-register"){ state.modal="register"; render(); return; }
    if(action==="account"){ state.modal=state.user?"account":"auth"; render(); return; }
    if(action==="new-project"){ if(needAuth()){state.modal="new";render();} return; }
    if(action==="new-branch"){ if(needAuth()){state.modal="branch";render();} return; }
    if(action==="edit-project"){ state.modal="edit";render();return; }
    if(action==="delete-project"){ if(confirm("この作品を削除しますか？")){await api(`/api/projects/${state.selectedId}`,{method:"DELETE"});state.selectedId=null;await loadProjects();flash("作品を削除しました");}return; }
    if(action==="bookmark"){ if(!needAuth())return; const d=await api(`/api/projects/${state.selectedId}/bookmark`,{method:"POST",body:"{}"});await loadDetail();flash(d.bookmarked?"ブックマークしました":"ブックマークを外しました");return; }
    if(action==="report"){ if(needAuth()){state.modal="report";render();}return; }
    if(action==="refresh"){await loadProjects();flash("作品一覧を更新しました");return;}
    if(action==="logout"){await api("/api/auth/logout",{method:"POST",body:"{}"});state.user=null;state.modal=null;state.notifications=[];await loadProjects();flash("ログアウトしました");return;}
    if(action==="profile-edit"){state.modal="profile";render();return;}
    if(action==="notifications"){if(!needAuth())return;const d=await api("/api/me/notifications");state.notifications=d.notifications;state.modal="notifications";render();return;}
    if(action==="notifications-read"){await api("/api/me/notifications/read",{method:"POST",body:"{}"});state.notifications=state.notifications.map(n=>({...n,is_read:1}));render();return;}
    if(action==="my-projects"){const d=await api("/api/projects?mine=1");state.modal={type:"collection",title:"自分の作品",projects:d.projects};render();return;}
    if(action==="bookmarks-panel"){const d=await api("/api/me/bookmarks");state.modal={type:"collection",title:"ブックマーク",projects:d.projects};render();return;}
    if(action==="admin-reports"){const d=await api("/api/admin/reports");state.modal={type:"admin",reports:d.reports};render();return;}
  } catch(error){flash(error.message);}
});

root.addEventListener("change",async event=>{
  if(event.target.name==='importText') {
    const field=event.target, form=field.form, file=field.files?.[0]; if(!file)return;
    try {
      if(!/\.txt$/i.test(file.name)||file.size>6*1024*1024)throw new Error('UTF-8のTXT（最大6MiB）を選択してください');
      let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());}catch{throw new Error('TXTをUTF-8で保存し直してください');}
      if(!text.trim()||text.length>20000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))throw new Error('本文は空でないテキスト・20,000文字以内にしてください');
      const body=form.elements.content;
      if(body.value&&!confirm('入力済みの本文をTXTの内容で置き換えますか？'))return;
      body.value=text; form.querySelector('.form-error').hidden=true; body.focus();
    } catch(error){formError(form,error.message);} finally{field.value='';} return;
  }
  try { if(event.target.dataset.report){await api(`/api/admin/reports/${event.target.dataset.report}`,{method:"PATCH",body:JSON.stringify({status:event.target.value})});flash("対応状態を更新しました");} }
  catch(error){flash(error.message);}
});

root.addEventListener("submit",async event=>{
  event.preventDefault(); const form=event.target;
  try {
    if(form.id==="search-form"){state.q=new FormData(form).get("q").trim();await loadProjects();render();return;}
    if(form.id==='password-form'){await api('/api/auth/password',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(form)))});state.modal=null;render();flash('パスワードを更新しました');return;}
    if(form.id==="auth-form"){
      if(form.dataset.saving)return;
      form.dataset.saving='true';form.setAttribute('aria-busy','true');
      const submit=form.querySelector('.primary-button'),label=submit.textContent;
      submit.disabled=true;submit.textContent='確認しています…';form.querySelector('.form-error').hidden=true;
      try {
        const d=Object.fromEntries(new FormData(form)),mode=form.dataset.mode;
        const result=await api(`/api/auth/${mode}`,{method:"POST",body:JSON.stringify(d)});
        if(result.confirmationRequired){formError(form,'登録は受け付けましたが、現在メール確認が必要な設定です。届かない場合は運営にお問い合わせください。');return;}
        state.user=result.user;state.modal=null;
        if(state.returnToBranch){await loadDetail();state.modal='branch';state.returnToBranch=false;render();}
        else{await loadProjects();flash(mode==="register"?"アカウントを作成しました":"ログインしました");}
      } finally {delete form.dataset.saving;form.removeAttribute('aria-busy');submit.disabled=false;submit.textContent=label;}
      return;
    }
    if(form.id==="project-form"){
      if(form.dataset.saving)return; form.dataset.saving='true'; const save=form.querySelector('.save-button');save.disabled=true;save.textContent='保存しています…';
      try{const payload=await formProject(form);const branch=form.dataset.branch==="true",editing=form.dataset.editing==="true";const url=branch?`/api/projects/${state.selectedId}/branches`:editing?`/api/projects/${state.selectedId}`:"/api/projects";const result=await api(url,{method:editing?"PATCH":"POST",body:JSON.stringify(payload)});state.modal=null;state.category="all";await loadProjects();state.selectedId=result.project.id;await loadDetail();flash(payload.status==='draft'?'下書きを保存しました':payload.visibility==='private'?'非公開で保存しました':payload.visibility==='unlisted'?'限定公開で保存しました':branch?"新しい派生を公開しました":editing?"作品を更新しました":"作品を公開しました");}
      finally{delete form.dataset.saving;save.disabled=false;save.textContent='保存する';}return;}
    if(form.id==="comment-form"){if(!needAuth())return;const message=new FormData(form).get("body");await api(`/api/projects/${state.selectedId}/comments`,{method:"POST",body:JSON.stringify({body:message})});await loadDetail();flash("コメントを投稿しました");return;}
    if(form.id==="profile-form"){const d=Object.fromEntries(new FormData(form));const result=await api("/api/profile",{method:"PATCH",body:JSON.stringify(d)});state.user=result.user;state.modal=null;render();flash("プロフィールを更新しました");return;}
    if(form.id==="report-form"){const d=Object.fromEntries(new FormData(form));await api(`/api/projects/${state.selectedId}/report`,{method:"POST",body:JSON.stringify(d)});state.modal=null;render();flash("運営へ通報しました");return;}
  } catch(error){formError(form,error.message);}
});

setupSearchSuggestions(root, {
  search: q => api(`/api/projects?${new URLSearchParams({q,category:state.category,sort:state.sort})}`).then(data=>data.projects),
  onSelect: async project => {
    state.q=''; await loadProjects(project.id); render();
    root.querySelector('.detail-panel')?.scrollIntoView({block:'start',behavior:'instant'});
    const heading=root.querySelector('.detail-panel h2'); if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}
  }
});
setupSortMenu(root, async value => {
  const previous=state.sort;
  state.sort=value;
  try { await loadProjects(); render(); }
  catch(error) { state.sort=previous; flash(error.message); }
});
boot().catch(error=>{ root.innerHTML=`<div class="fatal-state"><img src="/brand/unfinished-project-symbol.png" alt=""><h1>読み込みに失敗しました</h1><p>${esc(error.message)}</p><button onclick="location.reload()">再読み込み</button></div>`; });
