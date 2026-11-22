import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { neon } from '@neondatabase/serverless';

// Explicit editorial samples; no fictitious login accounts or engagement.
const base = new URL('../', import.meta.url);
const definitions = JSON.parse(await readFile(new URL('content/samples/catalog.json', base), 'utf8'));
const author = '運営サンプル編集部';
const authorId = '811ba212-b368-48fb-a395-f014866ab346';
const site = 'https://unfinished-project-eta.vercel.app';
const digest = value => createHash('sha256').update(value).digest('hex');
const entries = await Promise.all(definitions.map(async (entry, index) => {
  const content = (await readFile(new URL(`content/samples/${entry.file}`, base), 'utf8')).trim();
  const chars = Array.from(content).length;
  if (chars < 1900 || chars > 20000 || !content.includes('AI制作')) throw new Error(`Invalid manuscript: ${entry.file}`);
  return { ...entry, content, chars, id: `9a90cfc8-1f81-43c6-bcd6-${String(index + 1).padStart(12, '0')}` };
}));
console.log(JSON.stringify({ works: entries.map(({ title, chars }) => ({ title, chars })), total: entries.reduce((n, e) => n + e.chars, 0) }));
if (!process.argv.includes('--publish')) process.exit(0);
const sql = neon(process.env.DATABASE_URL);
const ids = entries.map(e => e.id);
const existing = await sql.query('SELECT id, author_id, content, parent_id FROM public.projects WHERE id = ANY($1::uuid[])', [ids]);
for (const row of existing) {
  const entry = entries.find(e => e.id === row.id);
  if (row.author_id !== authorId || digest(row.content) !== digest(entry.content) || row.parent_id !== (entry.parent === null ? null : entries[entry.parent].id)) throw new Error('Existing sample mismatch; refusing overwrite');
}
const profiles = await sql.query('SELECT display_name FROM public.profiles WHERE id=$1', [authorId]);
if (profiles.length && profiles[0].display_name !== author) throw new Error('Profile collision');
const statements = [sql.query('INSERT INTO public.profiles (id,display_name,bio) VALUES ($1,$2,$3) ON CONFLICT (id) DO NOTHING', [authorId, author, '運営が用意したAI制作の創作サンプルを掲載しています。実在の利用者の活動ではありません。小説は未完の草稿、音楽は歌詞・制作案、ゲームは未実装の企画書です。自由な派生の出発点としてお読みください。'])];
for (const e of entries) {
  if (existing.some(row => row.id === e.id)) continue;
  statements.push(sql.query(`INSERT INTO public.projects
    (id,author_id,parent_id,category,title,summary,content,author_note,progress,license,attribution,visibility,status,cover_url)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'derivatives-ok',$10,'public','published',$11)`,
  [e.id,authorId,e.parent === null ? null : entries[e.parent].id,e.category,e.title,`【AI制作サンプル】${e.summary}`,e.content,
    `運営が用意したAI制作の創作サンプルです。\n\n${e.note}`,
    `本文 約${e.chars.toLocaleString('ja-JP')}字 ／ ${e.category === 'novel' ? '続編募集中' : e.category === 'music' ? '音源未制作' : '未実装の企画書'}`,
    'AI制作のサンプル作品。派生時は作品名・運営サンプル編集部・派生元へのリンクを記載してください。',
    {novel:'/art/rain-novel.png',music:'/art/four-am-blue.png',game:'/art/underwater-post.png'}[e.category]]));
}
await sql.transaction(statements);
for (const e of entries) {
  const response = await fetch(`${site}/api/projects/${e.id}`, {signal:AbortSignal.timeout(30000)});
  if (!response.ok) throw new Error(`Public API: ${response.status}`);
  const data = await response.json();
  if (digest(data.project.content) !== digest(e.content) || data.project.authorName !== author) throw new Error(`Public verification failed: ${e.title}`);
  const reader = await fetch(`${site}/read.html?id=${e.id}`, {signal:AbortSignal.timeout(30000)});
  if (!reader.ok) throw new Error(`Reader unavailable: ${e.title}`);
  console.log(`Verified: ${e.title}`);
}
const catalog = ['# 公開した創作サンプル','',`運営サンプル編集部による10作品（原作7／派生3）、合計${entries.reduce((n,e)=>n+e.chars,0).toLocaleString('ja-JP')}字。`,'','AI制作サンプルです。音楽は音源未制作、ゲームは未実装の企画書です。', '', ...entries.flatMap(e => [`## ${e.title}`, '', `${e.chars.toLocaleString('ja-JP')}字${e.parent === null ? '' : ` ／ 派生元：${entries[e.parent].title}`}`, '', e.summary, '', `[本文を読む](${site}/read.html?id=${e.id})`, ''])].join('\n');
await writeFile(new URL('../sample-works-catalog.md', base), catalog);
console.log('Published and verified all 10 editorial samples.');
