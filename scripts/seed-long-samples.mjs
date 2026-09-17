// Explicitly authorized fictional sample batch. Never log credentials.
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { supabaseConfig } from '../lib/supabase-config.mjs';

const definitions = [
  ['01-station.txt','七分遅れの領収書','灯野 栞','novel',null,'亡き母が残したのは、使われなかった七分間の領収書。廃駅の第三窓口で、娘は過去を変えない再会に向き合う。','母の封筒を開ける直前までの三章。封筒の中身と、帰り道の選択を託します。'],
  ['02-voices.txt','九秒の波を保管する','波庭 透','novel',null,'閉校した校舎に集まる、誰かの声。九秒の録音を預かった記録係は、意味を決めつけずに聴く仕事を始める。','四章の草稿。屋上の音と古い時計の関係、録音を公開するかの判断が未完です。'],
  ['03-map.txt','地図屋は空白を売らない','紙谷 いと','novel',null,'祖父から継いだ地図屋では、道を知らない道へ戻す消しゴムを扱う。少女が消したいのは、姉と歩いた階段だった。','四章の草稿。地図の裏の待合室と、姉妹それぞれの帰り道を自由に続けてください。'],
  ['04-window.txt','第三窓口の引継ぎ','朝凪 朔','novel',0,'「七分遅れの領収書」の窓口側を描く派生小説。駅員と解体調査員が、残された七分間と駅名の裏側を見つめる。','母娘の原作の結末を決めず、駅を引き継ぐ人の物語として続きを託します。'],
  ['05-kitchen.txt','始発前、台所の灯り','小窓 音','music',null,'同居人が去った翌朝、二人分の習慣が残る台所を歌う。歌詞と72小節の編曲設計を収録。音源は未制作です。','歌詞・構成・録音方針までの草稿です。歌メロとアウトロの制作を託します。音源未制作。'],
  ['06-observation.txt','観測点17 — 夜の温室','露森 灯','music',null,'夜の温室を巡回するための、5拍子のインストゥルメンタル。48小節の展開、音色、環境音の扱いを設計。音源未制作。','具体的なモチーフと展開を持つ楽曲設計書です。演奏・音色の試作とループ終端が未完成です。'],
  ['07-nine-seconds.txt','九秒の窓','窓辺 こよみ','music',1,'小説「九秒の波を保管する」から生まれた6拍子の歌。原作の謎を解かず、聴き取れないものを残す。歌詞・編曲案／音源未制作。','小説から音楽への派生です。歌詞と80小節の構成があり、旋律と実演を託します。録音データはありません。'],
  ['08-tide.txt','潮待ち郵便局','汐路 航','game',null,'潮が引いた間だけ渡れる道で、手紙の届け方を考える。五地点の地図、三つの配達物、初日を遊ぶための未実装企画書。','初日の地図・時間・状態遷移まで設計済み。小さな試作と、三日目の封筒の物語を託します。'],
  ['09-market.txt','折りたたみ市場の修理屋','折原 麦','game',null,'夜には鞄へしまわれる紙の市場。昼は通れて、夜は畳める配置を作るパズル。盤面ルールと最初の一問を収録した未実装企画。','折り方一種類のルールと練習問題があります。遊べる試作、追加問題、店主の会話を託します。'],
  ['10-two-post.txt','潮待ち郵便局 — 二人で渡す最後の一通','島野 結','game',7,'配達員と受付係が情報を持ち寄る「潮待ち郵便局」の二人協力版。音声通話なしでも相談できる仕組みを考えた未実装企画。','原作の初日を二人用にする派生案。共有行動表と確認操作の試作から続きを作ってください。'],
];
const base = new URL('../', import.meta.url);
const ledgerPath = new URL('.private/sample-accounts-20260918.json', base);
const hash = text => createHash('sha256').update(text).digest('hex');
const entries = await Promise.all(definitions.map(async ([file,title,author,category,parent,summary,note]) => {
  const content = (await readFile(new URL(`content/samples/${file}`,base),'utf8')).trim();
  const chars = Array.from(content).length;
  if(chars < 1900 || chars > 20000 || !content.includes('AI制作')) throw new Error(`Invalid content: ${file} (${chars})`);
  return {file,title,author:`${author}［サンプル］`,category,parent,summary:`【AI制作サンプル】${summary}`,note,content,chars,hash:hash(content)};
}));
console.log(JSON.stringify({works:entries.map(e=>({title:e.title,characters:e.chars})),totalCharacters:entries.reduce((n,e)=>n+e.chars,0)},null,2));
if(!process.argv.includes('--publish')) process.exit(0);
const cfg = supabaseConfig();
const db = createClient(cfg.url,cfg.secretKey,{auth:{persistSession:false,autoRefreshToken:false}});
await mkdir(new URL('.private/',base),{recursive:true});
let ledger;
try { ledger=JSON.parse(await readFile(ledgerPath,'utf8')); } catch(e) {
  if(e.code!=='ENOENT') throw e;
  const batch=randomUUID();
  ledger={batch,origin:cfg.url,notice:'秘密情報：架空のサンプルアカウント。メールは受信できません。公開・コミット禁止。',accounts:entries.map((e,i)=>({title:e.title,displayName:e.author,contentHash:e.hash,email:`sample-${batch.slice(0,8)}-${i+1}@example.com`,password:randomBytes(27).toString('base64url')+'aA1!',projectId:randomUUID(),userId:null}))};
}
if(ledger.origin!==cfg.url || ledger.accounts.length!==entries.length) throw new Error('Ledger target mismatch');
for(let i=0;i<entries.length;i++) if(ledger.accounts[i].contentHash!==entries[i].hash || ledger.accounts[i].title!==entries[i].title) throw new Error('Content changed since batch creation');
async function save(){ const tmp=new URL('.private/sample-accounts-20260918.tmp',base); await writeFile(tmp,JSON.stringify(ledger,null,2),{mode:0o600}); await rename(tmp,ledgerPath); }
await save();
function check(result,operation){if(result.error) throw new Error(`${operation} failed (${result.error.code || result.error.status || 'unknown'})`);return result.data;}
// Inspect only IDs/metadata in memory to resume a previously interrupted create safely.
const matching=new Map();
for(let page=1;;page++){
  const data=check(await db.auth.admin.listUsers({page,perPage:1000}),'list users');
  for(const user of data.users) if(user.user_metadata?.sample_batch===ledger.batch) matching.set(user.email,user);
  if(data.users.length<1000) break;
}
for(let i=0;i<entries.length;i++){
  const entry=entries[i], account=ledger.accounts[i];
  let user=matching.get(account.email);
  if(!user && account.userId) throw new Error('Recorded sample account missing; refusing replacement');
  if(!user){ const data=check(await db.auth.admin.createUser({email:account.email,password:account.password,email_confirm:true,user_metadata:{displayName:entry.author,sample_batch:ledger.batch}}),'create sample account'); user=data.user; }
  if(user.user_metadata?.sample_batch!==ledger.batch || (account.userId && account.userId!==user.id)) throw new Error('Sample ownership mismatch');
  account.userId=user.id; await save();
  const profile=check(await db.from('profiles').select('id,role,display_name').eq('id',user.id).single(),'check profile');
  if(profile.role!=='member' || profile.display_name!==entry.author) throw new Error('Unexpected profile');
  check(await db.from('profiles').update({bio:`運営が用意した架空のサンプル作者です。掲載作品はAI制作の創作サンプルで、実在の利用者の活動ではありません。${entry.category==='novel'?'物語の続きを考えるための草稿を置いています。':entry.category==='music'?'歌詞や編曲設計を置いています。音源は未制作です。':'未実装のゲーム企画と試作のための設計を置いています。'}`}).eq('id',user.id),'sample bio');
  console.log(`Sample account ${i+1}/10 ready`);
}
const rows=entries.map((e,i)=>({id:ledger.accounts[i].projectId,author_id:ledger.accounts[i].userId,parent_id:e.parent===null?null:ledger.accounts[e.parent].projectId,category:e.category,title:e.title,summary:e.summary,content:e.content,author_note:`運営によるAI制作サンプルです。作者は架空のサンプルアカウントです。\n${e.note}`,progress:`本文 約${e.chars.toLocaleString('ja-JP')}字 ／ ${e.category==='novel'?'続編募集中':e.category==='music'?'音源未制作':'未実装の企画書'}`,license:'derivatives-ok',attribution:'AI制作のサンプル作品。派生時は作品名・サンプル作者名・派生元へのリンクを記載してください。',visibility:'public',status:'draft',cover_url:{novel:'/art/rain-novel.png',music:'/art/four-am-blue.png',game:'/art/underwater-post.png'}[e.category]}));
const ids=rows.map(r=>r.id);
const existing=check(await db.from('projects').select('id,author_id,content,parent_id').in('id',ids),'existing sample projects');
for(const old of existing){ const expected=rows.find(r=>r.id===old.id); if(old.author_id!==expected.author_id || hash(old.content)!==hash(expected.content) || old.parent_id!==expected.parent_id) throw new Error('Existing sample project mismatch'); }
const missing=rows.filter(r=>!existing.some(old=>old.id===r.id));
if(missing.length) check(await db.from('projects').insert(missing),'insert sample drafts');
const drafts=check(await db.from('projects').select('id,content,author_id').in('id',ids),'verify sample drafts');
if(drafts.length!==10 || drafts.some(p=>hash(p.content)!==hash(rows.find(r=>r.id===p.id).content))) throw new Error('Draft verification failed');
check(await db.from('projects').update({status:'published'}).in('id',ids),'publish samples');
ledger.publishedAt ??= new Date().toISOString(); await save();
const site='https://unfinished-project-eta.vercel.app';
for(let i=0;i<entries.length;i++){
  const response=await fetch(`${site}/api/projects/${ids[i]}`,{signal:AbortSignal.timeout(30000)});
  if(!response.ok) throw new Error(`Public project ${i+1} HTTP ${response.status}`);
  const data=await response.json();
  if(hash(data.project.content)!==entries[i].hash || data.project.authorName!==entries[i].author) throw new Error(`Public content mismatch ${i+1}`);
  const auth=createClient(cfg.url,cfg.publishableKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const login=check(await auth.auth.signInWithPassword({email:ledger.accounts[i].email,password:ledger.accounts[i].password}),'sample login');
  if(login.user.id!==ledger.accounts[i].userId) throw new Error('Login identity mismatch');
  check(await auth.auth.signOut({scope:'local'}),'sample logout');
  console.log(`Public content and account login verified ${i+1}/10`);
}
const catalog=['# 公開した創作サンプル','',`10アカウント・10作品（原作7／派生3）、本文合計 ${entries.reduce((n,e)=>n+e.chars,0).toLocaleString('ja-JP')}字。`,'','すべて運営が用意したAI制作サンプルです。作者は架空。音楽は歌詞・制作案で、音源未制作。ゲームは未実装の企画書です。','',...entries.flatMap((e,i)=>[`## ${i+1}. ${e.title}`,'',`作者：${e.author} ／ ${e.chars.toLocaleString('ja-JP')}字${e.parent===null?'':` ／ 派生元：${entries[e.parent].title}`}`,'',`[作品を読む](${site}/read.html?id=${ids[i]})`,'',e.summary,''])].join('\n');
await writeFile(new URL('../sample-works-catalog.md',base),catalog);
console.log('COMPLETE: 10 accounts, 10 published works; private credentials saved locally.');
