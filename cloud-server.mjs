import http from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { supabaseConfig } from './lib/supabase-config.mjs';
import { validateUpload, validateExternalUrl, MAX_FILE_BYTES } from './upload-validation.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
export function authErrorMessage(error, registering=false) {
  if(error.status===429)return '操作が集中しています。時間をおいて再試行してください。';
  if(error.code==='email_not_confirmed')return 'このアカウントはメール確認待ちです。確認メールのリンクを開いてください。届かない場合は「新規登録」の「確認メールを再送」から送信できます。';
  if(error.code==='invalid_credentials')return 'メールアドレスまたはパスワードが正しくありません。';
  return registering?'登録できませんでした。入力内容を確認し、時間をおいて再試行してください。':'ログインできませんでした。時間をおいて再試行してください。';
}
const clean = (value, max) => String(value ?? '').trim().slice(0, max);
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value || '');
export const canRead = (p, user) => !!p && (p.status === 'published' && p.visibility !== 'private' || p.author_id === user?.id || user?.role === 'admin');
export const canEdit = (p, user) => !!user && !!p && (p.author_id === user.id || user.role === 'admin');
const publicRow = p => p.status === 'published' && p.visibility === 'public';
const formats = { png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', mp3:'audio/mpeg', wav:'audio/wav', ogg:'audio/ogg', pdf:'application/pdf', txt:'text/plain', json:'application/json' };
const mime = file => ({'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.json':'application/json'})[extname(file)] || 'application/octet-stream';
const json = (res, status, value) => { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(JSON.stringify(value)); };
async function input(req) {
  let length = 0; const chunks = [];
  for await (const chunk of req) { length += chunk.length; if (length > 256 * 1024) fail(413,'送信内容が大きすぎます'); chunks.push(chunk); }
  try { const v = JSON.parse(Buffer.concat(chunks).toString() || '{}'); if (!v || typeof v !== 'object' || Array.isArray(v)) throw Error(); return v; }
  catch { fail(400,'JSON形式が不正です'); }
}
async function result(query) {
  const {data,error} = await query;
  if (error) { console.error('Supabase operation failed', error.code || 'unknown'); fail(503,'保存先との通信に失敗しました。時間をおいて再試行してください'); }
  return data;
}
function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) { const i = part.indexOf('='); if (i > 0) { try { out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1)); } catch {} } }
  return out;
}
function sessionCookies(res, session, secure) {
  const attrs = `; HttpOnly; SameSite=Lax; Path=/${secure ? '; Secure' : ''}`;
  res.setHeader('set-cookie', [
    `sb-access=${encodeURIComponent(session?.access_token || '')}${attrs}; Max-Age=${session ? 3600 : 0}`,
    `sb-refresh=${encodeURIComponent(session?.refresh_token || '')}${attrs}; Max-Age=${session ? 1209600 : 0}`,
  ]);
}
export function createCloudHandler({config = supabaseConfig(), staticDir = resolve(ROOT,'dist'), secure = process.env.NODE_ENV === 'production', clientFactory = createClient} = {}) {
  const options = {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
  const admin = clientFactory(config.url, config.secretKey, options);
  const storage = admin.storage.from(config.bucket);
  const authClient = () => clientFactory(config.url, config.publishableKey, options);
  const one = async (table,id) => uuid(id) ? result(admin.from(table).select('*').eq('id',id).maybeSingle()) : null;
  const project = async (id,user) => { const p = await one('projects',id); if (!canRead(p,user)) fail(404,'作品が見つからないか閲覧できません'); return p; };
  async function profile(authUser) {
    if (!authUser) return null;
    const p = await one('profiles',authUser.id);
    if (!p) fail(503,'プロフィールを準備できませんでした');
    return {id:p.id,email:authUser.email,displayName:p.display_name,bio:p.bio,role:p.role};
  }
  async function userFrom(req,res) {
    const c = cookies(req); if (!c['sb-access'] && !c['sb-refresh']) return null;
    const client = authClient();
    if (c['sb-access']) {
      const {data,error} = await client.auth.getUser(c['sb-access']);
      if (!error && data.user) return profile(data.user);
    }
    if (c['sb-refresh']) {
      const {data,error} = await client.auth.refreshSession({refresh_token:c['sb-refresh']});
      if (!error && data.session) { sessionCookies(res,data.session,secure); return profile(data.user); }
    }
    sessionCookies(res,null,secure); return null;
  }
  const requireUser = user => { if (!user) fail(401,'ログインが必要です'); return user; };
  async function serialize(rows,user) {
    if (!rows.length) return [];
    const ids = rows.map(p=>p.id);
    const authors = await result(admin.from('profiles').select('id,display_name').in('id',[...new Set(rows.map(p=>p.author_id))]));
    const children = await result(admin.from('projects').select('id,parent_id').in('parent_id',ids).eq('visibility','public').eq('status','published'));
    const comments = await result(admin.from('comments').select('project_id').in('project_id',ids));
    const marks = user ? await result(admin.from('bookmarks').select('project_id').eq('user_id',user.id).in('project_id',ids)) : [];
    return rows.map(p=>({id:p.id,authorId:p.author_id,authorName:authors.find(a=>a.id===p.author_id)?.display_name || '作者',parentId:p.parent_id,
      category:p.category,title:p.title,summary:p.summary,content:p.content,authorNote:p.author_note,progress:p.progress,license:p.license,attribution:p.attribution,
      visibility:p.visibility,status:p.status,coverUrl:p.cover_url,assetUrl:p.asset_url,assetName:p.asset_name,assetType:p.asset_type,externalUrl:p.external_url,
      branchCount:children.filter(c=>c.parent_id===p.id).length,commentCount:comments.filter(c=>c.project_id===p.id).length,
      bookmarked:marks.some(b=>b.project_id===p.id),createdAt:p.created_at,updatedAt:p.updated_at}));
  }
  async function notice(userId,kind,message,projectId) {
    const {error} = await admin.from('notifications').insert({user_id:userId,kind,message,project_id:projectId});
    if (error) console.error('Notification write failed');
  }
  async function attachment(value,user,kind) {
    if (!value) return null;
    if (!uuid(value.id)) fail(400,'ファイルを再選択してください');
    const row = await one('uploads',value.id);
    if (!row || row.owner_id !== user.id || row.kind !== kind || !['verified','attached'].includes(row.status)) fail(403,'このファイルは使用できません');
    return {url:`/uploads/${row.id}`,name:row.original_name,type:row.media_type};
  }
  async function fields(data,user,old) {
    const title = clean(data.title,140), summary = clean(data.summary,500);
    if (!title || !summary || !['novel','music','game'].includes(data.category)) fail(400,'カテゴリ、タイトル、紹介を入力してください');
    if (String(data.content||'').length > 20000 || String(data.authorNote||'').length > 5000) fail(400,'本文または作者メモが長すぎます');
    const cover = await attachment(data.cover,user,'cover'), asset = await attachment(data.upload,user,'asset');
    return {category:data.category,title,summary,content:clean(data.content,20000),author_note:clean(data.authorNote,5000),progress:clean(data.progress,120),
      license:['derivatives-ok','ask-first','no-derivatives'].includes(data.license)?data.license:'derivatives-ok',attribution:clean(data.attribution,300),
      visibility:['public','unlisted','private'].includes(data.visibility)?data.visibility:'public',status:data.status==='draft'?'draft':'published',
      external_url:validateExternalUrl(data.externalUrl),cover_url:cover?.url || old?.cover_url || null,
      asset_url:asset?.url || old?.asset_url || null,asset_name:asset?.name || old?.asset_name || null,asset_type:asset?.type || old?.asset_type || null};
  }
  return async (req,res) => {
    res.setHeader('x-content-type-options','nosniff'); res.setHeader('x-frame-options','DENY'); res.setHeader('referrer-policy','same-origin');
    res.setHeader('content-security-policy',`default-src 'self'; img-src 'self' data: ${config.url}; media-src 'self' ${config.url}; connect-src 'self' ${config.url}; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`);
    try {
      const url = new URL(req.url,'http://local'); const path = url.pathname; const method = req.method;
      if (!['GET','HEAD','POST','PATCH','DELETE'].includes(method)) fail(405,'対応していない操作です');
      if (['POST','PATCH','DELETE'].includes(method)) {
        const expected = `${secure?'https':'http'}://${req.headers.host}`;
        if (req.headers.origin !== expected) fail(403,'不正な送信元です');
      }
      if (path === '/api/health') return json(res,200,{ok:true,backend:'supabase'});
      if (path === '/api/config') return json(res,200,{backend:'supabase',storageOrigin:config.url});
      if (!path.startsWith('/api/') && !path.startsWith('/uploads/')) {
        let target = resolve(staticDir, '.' + decodeURIComponent(path === '/' ? '/index.html' : path));
        if (!target.startsWith(resolve(staticDir)+sep)) fail(404,'Not found');
        try { if (!(await stat(target)).isFile()) fail(404,'Not found'); } catch { fail(404,'Not found'); }
        res.writeHead(200,{'content-type':mime(target),'cache-control':'no-cache'}); return res.end(method==='HEAD' ? undefined : await readFile(target));
      }
      const user = await userFrom(req,res);
      if (path === '/api/session' && method === 'GET') return json(res,200,{user,backend:'supabase'});
      if (path === '/api/auth/logout' && method === 'POST') {
        const access = cookies(req)['sb-access']; if (access) await admin.auth.admin.signOut(access,'global');
        sessionCookies(res,null,secure); return json(res,200,{ok:true});
      }
      if (path === '/api/auth/session' && method === 'POST') {
        const data = await input(req); const auth = authClient();
        const {data:verified,error} = await auth.auth.setSession({access_token:String(data.access_token||''),refresh_token:String(data.refresh_token||'')});
        if (error || !verified.session) fail(401,'確認リンクが無効または期限切れです');
        const checked = await auth.auth.getUser(verified.session.access_token); if (checked.error) fail(401,'認証できませんでした');
        sessionCookies(res,verified.session,secure); return json(res,200,{user:await profile(checked.data.user)});
      }
      if (['/api/auth/login','/api/auth/register'].includes(path) && method === 'POST') {
        const data = await input(req), email = clean(data.email,180), password = String(data.password || '');
        if (!/^\S+@\S+\.\S+$/.test(email) || password.length<8 || password.length>128) fail(400,'メールと8〜128文字のパスワードを入力してください');
        const auth = authClient(); const registering = path.endsWith('register');
        if (registering && !clean(data.displayName,60)) fail(400,'表示名を入力してください');
        const response = registering ? await auth.auth.signUp({email,password,options:{data:{displayName:clean(data.displayName,60)}}}) : await auth.auth.signInWithPassword({email,password});
        if (response.error) fail(response.error.status===429?429:400,authErrorMessage(response.error,registering));
        if (!response.data.session) return json(res,200,{user:null,confirmationRequired:true});
        sessionCookies(res,response.data.session,secure); return json(res,200,{user:await profile(response.data.user)});
      }
      if (['/api/auth/recover','/api/auth/resend'].includes(path) && method === 'POST') {
        const data = await input(req), email = String(data.email || '').trim();
        if (email.length > 180 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400,'正しいメールアドレスを入力してください');
        const auth = authClient().auth;
        const {error} = path.endsWith('resend') ? await auth.resend({type:'signup',email}) : await auth.resetPasswordForEmail(email);
        if (error?.status === 429 || ['over_email_send_rate_limit','over_request_rate_limit'].includes(error?.code)) fail(429,'送信間隔が短すぎるか、送信上限に達しています。時間をおいて再試行してください。');
        // Do not disclose whether the account exists or is already confirmed.
        if (error && !['user_not_found','email_not_found','email_exists','email_already_confirmed'].includes(error.code)) fail(503,'メール送信を受け付けられませんでした。時間をおいて再試行してください。');
        return json(res,200,{ok:true});
      }
      if (path === '/api/auth/password' && method === 'POST') {
        requireUser(user); const data = await input(req); const password = String(data.password||'');
        if (password.length<8 || password.length>128) fail(400,'8〜128文字で入力してください');
        // Use a verified user session, never the privileged admin password-update API.
        const c = cookies(req), client = authClient();
        const established = await client.auth.setSession({access_token:c['sb-access'],refresh_token:c['sb-refresh']});
        if (established.error) fail(401,'再ログインしてください');
        const changed = await client.auth.updateUser({password}); if (changed.error) fail(400,'パスワードを変更できませんでした');
        sessionCookies(res,established.data.session,secure); return json(res,200,{ok:true});
      }
      if (path === '/api/profile' && method === 'PATCH') {
        requireUser(user); const data = await input(req); const name = clean(data.displayName,60); if (!name) fail(400,'表示名を入力してください');
        await result(admin.from('profiles').update({display_name:name,bio:clean(data.bio,500)}).eq('id',user.id));
        return json(res,200,{user:{...user,displayName:name,bio:clean(data.bio,500)}});
      }
      if (path === '/api/uploads/sign' && method === 'POST') {
        requireUser(user); const data = await input(req); const name = clean(data.name,180), extension = name.split('.').pop().toLowerCase(), type = formats[extension];
        const kind = data.kind === 'cover' ? 'cover' : 'asset';
        if (!type || kind==='cover' && !type.startsWith('image/') || !Number.isInteger(data.size) || data.size<1 || data.size>MAX_FILE_BYTES) fail(400,'ファイル形式またはサイズが不正です');
        const {count,error} = await admin.from('uploads').select('id',{head:true,count:'exact'}).eq('owner_id',user.id).gte('created_at',new Date(Date.now()-3600000).toISOString());
        if (error) fail(503,'アップロード枠を確認できません'); if (count>=20) fail(429,'1時間に登録できるファイル数を超えています');
        const id = randomUUID(), objectPath = `${user.id}/pending/${id}.${extension}`;
        await result(admin.from('uploads').insert({id,owner_id:user.id,object_path:objectPath,original_name:name,media_type:type,byte_size:data.size,kind}));
        const {data:signed,error:signError} = await storage.createSignedUploadUrl(objectPath,{upsert:false});
        if (signError) fail(503,'アップロードを準備できません');
        return json(res,200,{id,url:signed.signedUrl,type});
      }
      const verifyMatch = path.match(/^\/api\/uploads\/([^/]+)\/verify$/);
      if (verifyMatch && method === 'POST') {
        requireUser(user); const row = await one('uploads',verifyMatch[1]);
        if (!row || row.owner_id!==user.id) fail(404,'ファイルが見つかりません');
        if (row.status==='verified') return json(res,200,{id:row.id});
        if (row.status!=='pending') fail(400,'ファイルを再選択してください');
        const {data:blob,error} = await storage.download(row.object_path); if (error) fail(400,'アップロードが完了していません');
        const bytes = Buffer.from(await blob.arrayBuffer()); if (bytes.length!==row.byte_size) fail(400,'ファイルサイズが一致しません');
        const validated = validateUpload({name:row.original_name,type:row.media_type,data:bytes.toString('base64')},row.kind==='cover');
        const finalPath = `${user.id}/verified/${row.id}${validated.ext}`;
        const saved = await storage.upload(finalPath,validated.bytes,{contentType:validated.type,upsert:false});
        if (saved.error) fail(409,'ファイル検証を完了できません。再選択してください');
        await result(admin.from('uploads').update({object_path:finalPath,status:'verified'}).eq('id',row.id).eq('status','pending'));
        await storage.remove([row.object_path]); return json(res,200,{id:row.id});
      }
      const uploadMatch = path.match(/^\/uploads\/([^/]+)$/);
      if (uploadMatch && method === 'GET') {
        const row = await one('uploads',uploadMatch[1]); if (!row || !['verified','attached'].includes(row.status)) fail(404,'ファイルが見つかりません');
        const refs = await result(admin.from('projects').select('*').or(`cover_url.eq./uploads/${row.id},asset_url.eq./uploads/${row.id}`));
        if (!refs.some(p=>canRead(p,user))) fail(404,'ファイルが見つからないか閲覧できません');
        const {data,error} = await storage.createSignedUrl(row.object_path,60,{download:['text/plain','application/json','application/pdf'].includes(row.media_type)?row.original_name:false});
        if (error) fail(503,'ファイルを開けません');
        res.writeHead(302,{location:data.signedUrl,'cache-control':'private, no-store'}); return res.end();
      }
      if (path === '/api/projects' && method === 'GET') {
        let query = admin.from('projects').select('*');
        if (url.searchParams.get('mine')==='1') query = query.eq('author_id',requireUser(user).id);
        else query = query.is('parent_id',null).eq('visibility','public').eq('status','published');
        const category = url.searchParams.get('category'); if (['novel','music','game'].includes(category)) query = query.eq('category',category);
        const rows = await result(query.order(url.searchParams.get('sort')==='updated'?'updated_at':'created_at',{ascending:false}).limit(200));
        let projects = await serialize(rows,user); const q = clean(url.searchParams.get('q'),120).toLocaleLowerCase();
        if (q) projects = projects.filter(p=>`${p.title} ${p.summary} ${p.authorName}`.toLocaleLowerCase().includes(q));
        if (url.searchParams.get('sort')==='branches') projects.sort((a,b)=>b.branchCount-a.branchCount);
        return json(res,200,{projects});
      }
      const match = path.match(/^\/api\/projects\/([^/]+)(?:\/(branches|comments|bookmark|report))?$/);
      if (path === '/api/projects' && method === 'POST' || match?.[2]==='branches' && method==='POST') {
        requireUser(user); let parent = null;
        if (match) { parent = await project(match[1],user); if (parent.license==='no-derivatives') fail(403,'この作品は派生を許可していません'); }
        const data = await fields(await input(req),user); const row = await result(admin.from('projects').insert({...data,author_id:user.id,parent_id:parent?.id || null}).select().single());
        if (parent && parent.author_id!==user.id && publicRow(row)) await notice(parent.author_id,'branch',`${user.displayName}さんが続きを公開しました`,parent.id);
        return json(res,201,{project:(await serialize([row],user))[0]});
      }
      if (match) {
        const p = await project(match[1],user), action = match[2];
        if (!action && method === 'GET') {
          const branches = []; let frontier = [p.id]; const seen = new Set(frontier);
          for (let depth=0; frontier.length && depth<20 && branches.length<500; depth++) {
            const next = await result(admin.from('projects').select('*').in('parent_id',frontier).eq('visibility','public').eq('status','published').order('created_at').limit(500-branches.length));
            const fresh = next.filter(row=>!seen.has(row.id)); fresh.forEach(row=>seen.add(row.id)); branches.push(...fresh); frontier=fresh.map(row=>row.id);
          }
          const comments = await result(admin.from('comments').select('id,body,created_at,user_id,profiles(display_name)').eq('project_id',p.id).order('created_at').limit(200));
          return json(res,200,{project:(await serialize([p],user))[0],branches:await serialize(branches,user),canEdit:canEdit(p,user),comments:comments.map(c=>({id:c.id,body:c.body,createdAt:c.created_at,userId:c.user_id,authorName:c.profiles.display_name}))});
        }
        requireUser(user);
        if (!action && ['PATCH','DELETE'].includes(method)) {
          if (!canEdit(p,user)) fail(403,'編集権限がありません');
          if (method==='DELETE') { await result(admin.from('projects').delete().eq('id',p.id)); return json(res,200,{ok:true}); }
          const row = await result(admin.from('projects').update(await fields(await input(req),user,p)).eq('id',p.id).select().single());
          return json(res,200,{project:(await serialize([row],user))[0]});
        }
        if (action==='comments' && method==='POST') {
          const data=await input(req), message=clean(data.body,1000); if(!message) fail(400,'コメントを入力してください');
          await result(admin.from('comments').insert({project_id:p.id,user_id:user.id,body:message}));
          if(p.author_id!==user.id) await notice(p.author_id,'comment',`${user.displayName}さんがコメントしました`,p.id);
          return json(res,201,{ok:true});
        }
        if (action==='bookmark' && method==='POST') {
          const found=await result(admin.from('bookmarks').select('project_id').eq('user_id',user.id).eq('project_id',p.id).maybeSingle());
          if(found) await result(admin.from('bookmarks').delete().eq('user_id',user.id).eq('project_id',p.id));
          else await result(admin.from('bookmarks').upsert({user_id:user.id,project_id:p.id},{onConflict:'user_id,project_id'}));
          return json(res,200,{bookmarked:!found});
        }
        if (action==='report' && method==='POST') {
          const data=await input(req), reason=clean(data.reason,80); if(!reason) fail(400,'理由を入力してください');
          await result(admin.from('reports').insert({reporter_id:user.id,project_id:p.id,reason,detail:clean(data.detail,1000)})); return json(res,201,{ok:true});
        }
      }
      if(path==='/api/me/bookmarks' && method==='GET') {
        requireUser(user); const rows=await result(admin.from('bookmarks').select('projects(*)').eq('user_id',user.id).order('created_at',{ascending:false}).limit(200));
        return json(res,200,{projects:await serialize(rows.map(r=>r.projects).filter(p=>canRead(p,user)),user)});
      }
      if(path==='/api/me/notifications' && method==='GET') {requireUser(user);return json(res,200,{notifications:await result(admin.from('notifications').select('*').eq('user_id',user.id).order('created_at',{ascending:false}).limit(50))});}
      if(path==='/api/me/notifications/read' && method==='POST') {requireUser(user);await result(admin.from('notifications').update({is_read:true}).eq('user_id',user.id));return json(res,200,{ok:true});}
      if(path.startsWith('/api/admin/')) {
        requireUser(user);if(user.role!=='admin')fail(403,'管理者権限が必要です');
        if(path==='/api/admin/reports'&&method==='GET'){const rows=await result(admin.from('reports').select('*,projects(title),profiles(display_name)').order('created_at',{ascending:false}).limit(200));return json(res,200,{reports:rows.map(r=>({...r,title:r.projects.title,reporter_name:r.profiles.display_name}))});}
        const reportId=path.match(/^\/api\/admin\/reports\/([^/]+)$/)?.[1];
        if(uuid(reportId)&&method==='PATCH'){const data=await input(req);if(!['open','reviewing','resolved','dismissed'].includes(data.status))fail(400,'状態が不正です');await result(admin.from('reports').update({status:data.status,resolved_at:['resolved','dismissed'].includes(data.status)?new Date().toISOString():null}).eq('id',reportId));return json(res,200,{ok:true});}
      }
      fail(404,'見つかりません');
    } catch(error) { if(!error.status) console.error('Cloud request failed'); if(!res.headersSent) json(res,error.status||500,{error:error.status?error.message:'サーバーエラーが発生しました'}); else res.end(); }
  };
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  http.createServer(createCloudHandler()).listen(Number(process.env.PORT||5174),process.env.HOST||'127.0.0.1',()=>console.log('Supabase app listening'));
}
