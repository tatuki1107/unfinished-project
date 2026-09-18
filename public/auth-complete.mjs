// Tokens are used once in memory; never persist them in browser storage or logs.
export async function completeEmailAuth({document,location,history,fetch,redirect=url=>location.replace(url),schedule=setTimeout}) {
 const fragment=new URLSearchParams(location.hash.slice(1));
 const access=fragment.get('access_token'),refresh=fragment.get('refresh_token');
 const recovery=fragment.get('type')==='recovery';
 history.replaceState(null,'',location.pathname);
 const card=document.querySelector('.auth-card'),title=document.querySelector('#auth-title'),message=document.querySelector('#auth-message'),actions=document.querySelector('#auth-actions');
 const fail=copy=>{card.dataset.status='error';card.setAttribute('aria-busy','false');title.textContent='確認を完了できませんでした';message.textContent=copy;message.setAttribute('role','alert');actions.hidden=false;};
 if(fragment.has('error')||!access||!refresh){fail('リンクが期限切れ・使用済み、または確認情報が見つかりません。登録済みの方はログインしてください。確認待ちの方は新しい確認メールを再送できます。');return;}
 try {
  const response=await fetch('/api/auth/session',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({access_token:access,refresh_token:refresh})});
  const result=await response.json();
  if(!response.ok||!result.user){fail('確認リンクが無効・期限切れ、または認証処理に失敗しました。確認メールを再送するか、ログインをお試しください。');return;}
  // Confirm the HttpOnly session cookie was accepted before redirecting.
  const session=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
  const current=await session.json();
  if(!session.ok||current.user?.id!==result.user.id){fail('ログイン状態を保存できませんでした。ブラウザのCookie設定をご確認のうえ、ログインしてください。');return;}
  card.dataset.status='success';card.setAttribute('aria-busy','false');
  title.textContent=recovery?'再設定の準備ができました':'登録が完了しました';
  message.textContent=recovery?'パスワードの再設定画面へ移動します。':'ログインしました。作品一覧へ移動します。';
  const destination=recovery?'/?auth=recovery':'/';
  actions.replaceChildren();const link=document.createElement('a');link.className='primary';link.href=destination;link.textContent=recovery?'パスワード再設定へ':'作品を探す';actions.append(link);actions.hidden=false;
  schedule(()=>redirect(destination),1600);
 } catch {fail('通信に失敗しました。接続を確認してログインをお試しください。確認が完了していない場合はメールを再送できます。');}
}
if(typeof document!=='undefined')completeEmailAuth({document,location,history,fetch});
