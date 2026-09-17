import http from "node:http";
import { validateUpload, validateExternalUrl } from './upload-validation.mjs';
import { DatabaseSync } from "node:sqlite";
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
// Two 6 MiB attachments expand to 16 MiB in base64, plus text and JSON.
const MAX_BODY = 17 * 1024 * 1024;
const SESSION_MS = 1000 * 60 * 60 * 24 * 14;
const UPLOAD_TYPES = new Map([
  ["image/png", ".png"], ["image/jpeg", ".jpg"], ["image/webp", ".webp"],
  ["audio/mpeg", ".mp3"], ["audio/wav", ".wav"], ["audio/ogg", ".ogg"],
  ["application/pdf", ".pdf"], ["text/plain", ".txt"], ["application/json", ".json"]
]);

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

function verifyPassword(password, encoded) {
  const [salt, value] = String(encoded).split(":");
  if (!salt || !value) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(value, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function createDatabase(dataDir) {
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(join(dataDir, "uploads"), { recursive: true });
  const db = new DatabaseSync(join(dataDir, "app.db"));
  db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL, bio TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'member',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, author_id TEXT NOT NULL REFERENCES users(id), parent_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
      category TEXT NOT NULL, title TEXT NOT NULL, summary TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
      progress TEXT NOT NULL DEFAULT '', license TEXT NOT NULL DEFAULT 'derivatives-ok', attribution TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'public', status TEXT NOT NULL DEFAULT 'published',
      cover_url TEXT, asset_url TEXT, asset_name TEXT, asset_type TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS bookmarks (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(user_id, project_id)
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, message TEXT NOT NULL, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
      is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES users(id), project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      reason TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS projects_parent_idx ON projects(parent_id);
    CREATE INDEX IF NOT EXISTS projects_search_idx ON projects(category, status, visibility, updated_at);
    CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, is_read, created_at);
  `);
  if(!db.prepare('PRAGMA table_info(projects)').all().some(c=>c.name==='external_url')) db.exec('ALTER TABLE projects ADD COLUMN external_url TEXT');
  if(!db.prepare('PRAGMA table_info(projects)').all().some(c=>c.name==='author_note')) db.exec("ALTER TABLE projects ADD COLUMN author_note TEXT NOT NULL DEFAULT ''");
  if(process.env.NODE_ENV!=='production') seed(db);
  else if(db.prepare("SELECT 1 FROM users WHERE email='admin@example.com'").get()) throw new Error('Production refuses demo database; provision a clean database and a real administrator.');
  return db;
}

function seed(db) {
  if (db.prepare("SELECT COUNT(*) AS count FROM users").get().count) return;
  const users = [
    ["u-madoka", "madoka@example.com", "demo1234", "鈴木まどか", "雨の日に物語を書いています。", "member"],
    ["u-rui", "rui@example.com", "demo1234", "安西ルイ", "ピアノと生活音の断片。", "member"],
    ["u-tsugumi", "tsugumi@example.com", "demo1234", "佐伯つぐみ", "小さな世界を遊べる形にします。", "member"],
    ["u-admin", "admin@example.com", "admin1234", "運営チーム", "コミュニティ運営", "admin"]
  ];
  const insertUser = db.prepare("INSERT INTO users(id,email,password_hash,display_name,bio,role) VALUES(?,?,?,?,?,?)");
  for (const [id,email,password,name,bio,role] of users) insertUser.run(id,email,hashPassword(password),name,bio,role);
  const insert = db.prepare(`INSERT INTO projects
    (id,author_id,parent_id,category,title,summary,content,progress,license,attribution,visibility,status,cover_url,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const rows = [
    ["p-rain","u-madoka",null,"novel","雨が止むまで名前を忘れる","雨が降るたび、町の人々はひとつずつ固有名詞を忘れていく。第3章の途中まで。","町から『雨』という言葉が消えた後を、自由に書いてください。","18 / 42 ページ","derivatives-ok","作者表記を引き継いでください","public","published","/art/rain-novel.png","2026-09-14 10:00:00","2026-09-14 10:00:00"],
    ["p-blue","u-rui",null,"music","午前四時のブルー","Aメロとサビだけのデモ。低いピアノと生活音で、朝に溶ける夜を残しました。","ボーカルも歌詞も仮のままです。別の声、別の楽器で続きを作ってください。","2:18 / BPM 74","derivatives-ok","原曲者をクレジットしてください","public","published","/art/four-am-blue.png","2026-09-12 08:00:00","2026-09-12 08:00:00"],
    ["p-post","u-tsugumi",null,"game","海底郵便局 — 届かない手紙の配達員","沈んだ町を巡り、生前に届かなかった手紙を配る探索ゲーム。最初の3エリアまで設計済み。","物語、ゲームループ、ビジュアル案のどこからでも参加できます。最後の配達先はまだ空白です。","企画書 14ページ","derivatives-ok","原作者と派生元を表記してください","public","published","/art/underwater-post.png","2026-09-10 09:00:00","2026-09-16 09:00:00"],
    ["p-post-a","u-madoka","p-post","game","手紙収集ADV案","手紙を集める探索ADVとして再構成。","6章分のプロットを追加しました。","6章","derivatives-ok","派生元を表記","public","published","/art/underwater-post.png","2026-09-15 09:00:00","2026-09-15 09:00:00"],
    ["p-post-b","u-rui","p-post","music","二人協力版","二人で別々の海域を巡る派生企画。","声と音で位置を伝える協力プレイ案。","企画メモ","derivatives-ok","派生元を表記","public","published","/art/underwater-post.png","2026-09-15 12:00:00","2026-09-15 12:00:00"],
    ["p-post-c","u-madoka","p-post","novel","あの夏、海に捨てた言葉たち","郵便配達員の過去を描く短編。","海に沈んだ手紙の送り主を追う物語。","短編 8ページ","derivatives-ok","派生元を表記","public","published","/art/underwater-post.png","2026-09-16 14:00:00","2026-09-16 14:00:00"]
  ];
  for (const row of rows) insert.run(...row);
}

function parseCookies(header = "") {
  return Object.fromEntries(header.split(";").map(v => v.trim()).filter(Boolean).map(v => {
    const index = v.indexOf("="); return [decodeURIComponent(v.slice(0,index)), decodeURIComponent(v.slice(index+1))];
  }));
}

function send(res, status, payload, extra = {}) {
  res.writeHead(status, { "content-type":"application/json; charset=utf-8", "cache-control":"no-store", ...extra });
  res.end(JSON.stringify(payload));
}

async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) throw Object.assign(new Error("送信サイズが大きすぎます"),{status:413}); chunks.push(chunk); }
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw Object.assign(new Error("JSON形式が不正です"),{status:400}); }
}

function clean(value, max = 5000) { return String(value ?? "").trim().slice(0,max); }
function publicUser(row) { return row && { id:row.id, email:row.email, displayName:row.display_name, bio:row.bio, role:row.role }; }

function sessionUser(db, req) {
  const sid = parseCookies(req.headers.cookie).session;
  if (!sid) return null;
  const row = db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires_at>?`).get(sid, Date.now());
  return row || null;
}

function requireUser(db, req) {
  const user = sessionUser(db, req);
  if (!user) throw Object.assign(new Error("ログインが必要です"),{status:401});
  return user;
}

function checkOrigin(req) {
  if (!["POST","PUT","PATCH","DELETE"].includes(req.method)) return;
  const origin = req.headers.origin;
  if (!origin) return;
  const expected = `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}`;
  if (origin !== expected) throw Object.assign(new Error("不正な送信元です"),{status:403});
}

function canRead(p,user) { return Boolean(p && ((p.status==='published'&&p.visibility!=='private')||p.author_id===user?.id||user?.role==='admin')); }
function assertReadable(p,user) { if(!canRead(p,user)) throw Object.assign(new Error('作品が見つからないか閲覧できません'),{status:404}); }
function projectRow(db, id, user) {
  return db.prepare(`SELECT p.*,u.display_name AS author_name,
    (SELECT COUNT(*) FROM projects c WHERE c.parent_id=p.id AND c.status='published' AND c.visibility='public') AS branch_count,
    (SELECT COUNT(*) FROM comments c WHERE c.project_id=p.id) AS comment_count,
    (SELECT COUNT(*) FROM bookmarks b WHERE b.project_id=p.id) AS bookmark_count,
    EXISTS(SELECT 1 FROM bookmarks b WHERE b.project_id=p.id AND b.user_id=?) AS bookmarked
    FROM projects p JOIN users u ON u.id=p.author_id WHERE p.id=?`).get(user?.id ?? "", id);
}

function serializeProject(row) {
  return row && {
    id:row.id, authorId:row.author_id, authorName:row.author_name, parentId:row.parent_id,
    category:row.category, title:row.title, summary:row.summary, content:row.content, progress:row.progress,
    license:row.license, attribution:row.attribution, visibility:row.visibility, status:row.status,
    coverUrl:row.cover_url, assetUrl:row.asset_url, assetName:row.asset_name, assetType:row.asset_type, externalUrl:row.external_url, authorNote:row.author_note||'',
    branchCount:Number(row.branch_count||0), commentCount:Number(row.comment_count||0), bookmarkCount:Number(row.bookmark_count||0),
    bookmarked:Boolean(row.bookmarked), createdAt:row.created_at, updatedAt:row.updated_at
  };
}

function saveUpload(dataDir, upload, cover=false) {
  const checked=validateUpload(upload,cover); if(!checked)return null;
  const {type,ext,bytes}=checked;
  const name = `${randomUUID()}${ext}`;
  writeFileSync(join(dataDir,"uploads",name),bytes);
  return { url:`/uploads/${name}`, name:clean(upload.name,180)||name, type };
}

function validateProjectFiles(input) {
  input.externalUrl=validateExternalUrl(input.externalUrl);
  validateUpload(input.upload); validateUpload(input.cover,true);
  if(String(input.content??'').length>20000) throw Object.assign(new Error('本文は20,000文字以内にしてください'),{status:400});
  return input;
}

function notify(db, userId, kind, message, projectId) {
  db.prepare("INSERT INTO notifications(id,user_id,kind,message,project_id) VALUES(?,?,?,?,?)").run(randomUUID(),userId,kind,message,projectId);
}

function mime(path) {
  return ({".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".mjs":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".webp":"image/webp",".svg":"image/svg+xml",".woff2":"font/woff2",".mp3":"audio/mpeg",".wav":"audio/wav",".ogg":"audio/ogg",".pdf":"application/pdf",".txt":"text/plain; charset=utf-8"})[extname(path).toLowerCase()]||"application/octet-stream";
}

export function createAppServer({ dataDir=resolve(ROOT,"data"), staticDir=resolve(ROOT,"dist") }={}) {
  const db = createDatabase(dataDir);
  const rate = new Map();
  const server = http.createServer(async (req,res) => {
    const security = {"x-content-type-options":"nosniff","x-frame-options":"DENY","referrer-policy":"same-origin","permissions-policy":"camera=(), microphone=(), geolocation=()","content-security-policy":"default-src 'self'; img-src 'self' data:; media-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"};
    for (const [k,v] of Object.entries(security)) res.setHeader(k,v);
    try {
      const url = new URL(req.url,"http://local");
      const path = decodeURIComponent(url.pathname);
      const ip = req.socket.remoteAddress || "local";
      const bucket = rate.get(ip) || {at:Date.now(),count:0};
      if (Date.now()-bucket.at>60_000) { bucket.at=Date.now(); bucket.count=0; }
      bucket.count++; rate.set(ip,bucket);
      if (bucket.count>240) throw Object.assign(new Error("操作が多すぎます。少し待ってください"),{status:429});
      checkOrigin(req);

      if (path === "/api/health" && req.method === "GET") return send(res,200,{ok:true});
      if (path === "/api/session" && req.method === "GET") return send(res,200,{user:publicUser(sessionUser(db,req))});

      if (path === "/api/auth/register" && req.method === "POST") {
        const input = await body(req); const email=clean(input.email,180).toLowerCase(); const password=String(input.password||""); const name=clean(input.displayName,60);
        if (!/^\S+@\S+\.\S+$/.test(email)||password.length<8||!name) throw Object.assign(new Error("名前、正しいメール、8文字以上のパスワードが必要です"),{status:400});
        if (db.prepare("SELECT 1 FROM users WHERE email=?").get(email)) throw Object.assign(new Error("このメールは登録済みです"),{status:409});
        const id=randomUUID(); db.prepare("INSERT INTO users(id,email,password_hash,display_name) VALUES(?,?,?,?)").run(id,email,hashPassword(password),name);
        const sid=randomUUID(); db.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)").run(sid,id,Date.now()+SESSION_MS);
        return send(res,201,{user:publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(id))},{"set-cookie":`session=${sid}; HttpOnly; SameSite=Lax; Path=/; ${process.env.NODE_ENV==='production'?'Secure; ':''}Max-Age=${SESSION_MS/1000}`});
      }
      if (path === "/api/auth/login" && req.method === "POST") {
        const input=await body(req); const row=db.prepare("SELECT * FROM users WHERE email=?").get(clean(input.email,180).toLowerCase());
        if (!row||!verifyPassword(String(input.password||""),row.password_hash)) throw Object.assign(new Error("メールまたはパスワードが違います"),{status:401});
        const sid=randomUUID(); db.prepare("INSERT INTO sessions(id,user_id,expires_at) VALUES(?,?,?)").run(sid,row.id,Date.now()+SESSION_MS);
        return send(res,200,{user:publicUser(row)},{"set-cookie":`session=${sid}; HttpOnly; SameSite=Lax; Path=/; ${process.env.NODE_ENV==='production'?'Secure; ':''}Max-Age=${SESSION_MS/1000}`});
      }
      if (path === "/api/auth/logout" && req.method === "POST") {
        const sid=parseCookies(req.headers.cookie).session; if (sid) db.prepare("DELETE FROM sessions WHERE id=?").run(sid);
        return send(res,200,{ok:true},{"set-cookie": `session=; HttpOnly; SameSite=Lax; Path=/; ${process.env.NODE_ENV==='production'?'Secure; ':''}Max-Age=0`});
      }
      if (path === "/api/profile" && req.method === "PATCH") {
        const user=requireUser(db,req); const input=await body(req); const name=clean(input.displayName,60); if(!name) throw Object.assign(new Error("表示名が必要です"),{status:400});
        db.prepare("UPDATE users SET display_name=?,bio=? WHERE id=?").run(name,clean(input.bio,500),user.id);
        return send(res,200,{user:publicUser(db.prepare("SELECT * FROM users WHERE id=?").get(user.id))});
      }

      if (path === "/api/projects" && req.method === "GET") {
        const user=sessionUser(db,req); const q=clean(url.searchParams.get("q"),120); const category=clean(url.searchParams.get("category"),20); const sort=url.searchParams.get("sort")||"new"; const mine=url.searchParams.get("mine")==="1";
        let where = mine&&user ? "p.author_id=?" : "p.parent_id IS NULL AND p.status='published' AND p.visibility='public'"; const params=mine&&user?[user.id]:[];
        if (category&&category!=="all") { where+=" AND p.category=?"; params.push(category); }
        if (q) { where+=" AND (p.title LIKE ? OR p.summary LIKE ? OR u.display_name LIKE ?)"; params.push(`%${q}%`,`%${q}%`,`%${q}%`); }
        const order=sort==="branches"?"branch_count DESC,p.updated_at DESC":sort==="updated"?"p.updated_at DESC":"p.created_at DESC";
        const rows=db.prepare(`SELECT p.*,u.display_name AS author_name,(SELECT COUNT(*) FROM projects c WHERE c.parent_id=p.id AND c.status='published' AND c.visibility='public') AS branch_count,(SELECT COUNT(*) FROM comments c WHERE c.project_id=p.id) AS comment_count,(SELECT COUNT(*) FROM bookmarks b WHERE b.project_id=p.id) AS bookmark_count,EXISTS(SELECT 1 FROM bookmarks b WHERE b.project_id=p.id AND b.user_id=?) AS bookmarked FROM projects p JOIN users u ON u.id=p.author_id WHERE ${where} ORDER BY ${order}`).all(user?.id??"",...params);
        return send(res,200,{projects:rows.map(serializeProject)});
      }
      if (path === "/api/projects" && req.method === "POST") {
        const user=requireUser(db,req); const input=validateProjectFiles(await body(req)); const title=clean(input.title,140), summary=clean(input.summary,500), category=clean(input.category,20);
        if(!title||!summary||!["novel","music","game"].includes(category)) throw Object.assign(new Error("カテゴリ、タイトル、概要が必要です"),{status:400});
        const upload=saveUpload(dataDir,input.upload); const cover=saveUpload(dataDir,input.cover); const id=randomUUID();
        db.prepare(`INSERT INTO projects(id,author_id,parent_id,category,title,summary,content,progress,license,attribution,visibility,status,cover_url,asset_url,asset_name,asset_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,user.id,null,category,title,summary,clean(input.content,20000),clean(input.progress,120),clean(input.license,40)||"derivatives-ok",clean(input.attribution,300),["public","unlisted","private"].includes(input.visibility)?input.visibility:"public",input.status==="draft"?"draft":"published",cover?.url||null,upload?.url||null,upload?.name||null,upload?.type||null);
        db.prepare('UPDATE projects SET external_url=?,author_note=? WHERE id=?').run(input.externalUrl,clean(input.authorNote,5000),id);
        return send(res,201,{project:serializeProject(projectRow(db,id,user))});
      }

      const projectMatch=path.match(/^\/api\/projects\/([^/]+)$/);
      if (projectMatch && req.method === "GET") {
        const user=sessionUser(db,req); const row=projectRow(db,projectMatch[1],user); if(!row) throw Object.assign(new Error("作品が見つかりません"),{status:404});
        if ((row.visibility==="private"||row.status==="draft")&&row.author_id!==user?.id&&user?.role!=="admin") throw Object.assign(new Error("閲覧できません"),{status:403});
        const branches=db.prepare(`WITH RECURSIVE tree AS (SELECT * FROM projects WHERE parent_id=? UNION ALL SELECT p.* FROM projects p JOIN tree t ON p.parent_id=t.id) SELECT tree.*,u.display_name AS author_name,(SELECT COUNT(*) FROM projects c WHERE c.parent_id=tree.id) branch_count FROM tree JOIN users u ON u.id=tree.author_id WHERE tree.status='published' AND tree.visibility='public' ORDER BY tree.created_at`).all(row.id).map(serializeProject);
        const comments=db.prepare("SELECT c.id,c.body,c.created_at createdAt,u.id userId,u.display_name authorName FROM comments c JOIN users u ON u.id=c.user_id WHERE c.project_id=? ORDER BY c.created_at").all(row.id);
        return send(res,200,{project:serializeProject(row),branches,comments,canEdit:Boolean(user&&(user.id===row.author_id||user.role==="admin"))});
      }
      if (projectMatch && req.method === "PATCH") {
        const user=requireUser(db,req); const row=projectRow(db,projectMatch[1],user); if(!row||(row.author_id!==user.id&&user.role!=="admin")) throw Object.assign(new Error("編集権限がありません"),{status:403});
        const raw=await body(req); const input=validateProjectFiles({...raw,externalUrl:raw.externalUrl===undefined?row.external_url:raw.externalUrl}); const cover=saveUpload(dataDir,input.cover,true); const upload=saveUpload(dataDir,input.upload);
        db.prepare(`UPDATE projects SET category=?,title=?,summary=?,content=?,progress=?,license=?,attribution=?,visibility=?,status=?,cover_url=COALESCE(?,cover_url),asset_url=COALESCE(?,asset_url),asset_name=COALESCE(?,asset_name),asset_type=COALESCE(?,asset_type),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(["novel","music","game"].includes(input.category)?input.category:row.category,clean(input.title,140)||row.title,clean(input.summary,500)||row.summary,clean(input.content,20000),clean(input.progress,120),clean(input.license,40)||row.license,clean(input.attribution,300),["public","unlisted","private"].includes(input.visibility)?input.visibility:row.visibility,input.status==="draft"?"draft":"published",cover?.url||null,upload?.url||null,upload?.name||null,upload?.type||null,row.id);
        db.prepare('UPDATE projects SET external_url=?,author_note=? WHERE id=?').run(input.externalUrl,input.authorNote===undefined?row.author_note:clean(input.authorNote,5000),row.id);
        return send(res,200,{project:serializeProject(projectRow(db,row.id,user))});
      }
      if (projectMatch && req.method === "DELETE") {
        const user=requireUser(db,req); const row=projectRow(db,projectMatch[1],user); if(!row||(row.author_id!==user.id&&user.role!=="admin")) throw Object.assign(new Error("削除権限がありません"),{status:403});
        db.prepare("DELETE FROM projects WHERE id=?").run(row.id); return send(res,200,{ok:true});
      }

      const branchesMatch=path.match(/^\/api\/projects\/([^/]+)\/branches$/);
      if (branchesMatch&&req.method==="POST") {
        const user=requireUser(db,req); const parent=projectRow(db,branchesMatch[1],user); if(!parent) throw Object.assign(new Error("派生元が見つかりません"),{status:404}); if(parent.license==="no-derivatives") throw Object.assign(new Error("この作品は派生を許可していません"),{status:403});
        if((parent.visibility==='private'||parent.status==='draft')&&parent.author_id!==user.id&&user.role!=='admin') throw Object.assign(new Error('閲覧できません'),{status:403});
        const input=validateProjectFiles(await body(req)), title=clean(input.title,140), summary=clean(input.summary,500); if(!title||!summary) throw Object.assign(new Error("タイトルと概要が必要です"),{status:400}); const upload=saveUpload(dataDir,input.upload); const cover=saveUpload(dataDir,input.cover,true); const id=randomUUID();
        db.prepare(`INSERT INTO projects(id,author_id,parent_id,category,title,summary,content,progress,license,attribution,visibility,status,cover_url,asset_url,asset_name,asset_type) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,user.id,parent.id,["novel","music","game"].includes(input.category)?input.category:parent.category,title,summary,clean(input.content,20000),clean(input.progress,120),clean(input.license,40)||"derivatives-ok",clean(input.attribution,300)||`派生元「${parent.title}」`,["public","unlisted","private"].includes(input.visibility)?input.visibility:"public",input.status==="draft"?"draft":"published",cover?.url||parent.cover_url,upload?.url||null,upload?.name||null,upload?.type||null);
        db.prepare('UPDATE projects SET external_url=?,author_note=? WHERE id=?').run(input.externalUrl,clean(input.authorNote,5000),id);
        // Do not propagate protected covers to publicly viewable derivatives.
        if(!cover&&parent.cover_url?.startsWith('/uploads/')) db.prepare('UPDATE projects SET cover_url=NULL WHERE id=?').run(id);
        if(parent.author_id!==user.id) notify(db,parent.author_id,"branch",`${user.display_name}さんが「${parent.title}」の続きを公開しました`,parent.id);
        return send(res,201,{project:serializeProject(projectRow(db,id,user))});
      }
      const commentsMatch=path.match(/^\/api\/projects\/([^/]+)\/comments$/);
      if(commentsMatch&&req.method==="POST") {
        const user=requireUser(db,req); const project=projectRow(db,commentsMatch[1],user); if(!project) throw Object.assign(new Error("作品が見つかりません"),{status:404}); assertReadable(project,user); const input=await body(req), message=clean(input.body,1000); if(!message) throw Object.assign(new Error("コメントを入力してください"),{status:400}); const id=randomUUID(); db.prepare("INSERT INTO comments(id,project_id,user_id,body) VALUES(?,?,?,?)").run(id,project.id,user.id,message); if(project.author_id!==user.id) notify(db,project.author_id,"comment",`${user.display_name}さんがコメントしました`,project.id); return send(res,201,{ok:true});
      }
      const bookmarkMatch=path.match(/^\/api\/projects\/([^/]+)\/bookmark$/);
      if(bookmarkMatch&&req.method==="POST") {
        const user=requireUser(db,req); const project=projectRow(db,bookmarkMatch[1],user); if(!project) throw Object.assign(new Error("作品が見つかりません"),{status:404}); assertReadable(project,user); const found=db.prepare("SELECT 1 FROM bookmarks WHERE user_id=? AND project_id=?").get(user.id,project.id); if(found) db.prepare("DELETE FROM bookmarks WHERE user_id=? AND project_id=?").run(user.id,project.id); else { db.prepare("INSERT INTO bookmarks(user_id,project_id) VALUES(?,?)").run(user.id,project.id); if(project.author_id!==user.id) notify(db,project.author_id,"bookmark",`${user.display_name}さんが作品を保存しました`,project.id); } return send(res,200,{bookmarked:!found});
      }
      const reportMatch=path.match(/^\/api\/projects\/([^/]+)\/report$/);
      if(reportMatch&&req.method==="POST") { const user=requireUser(db,req); assertReadable(projectRow(db,reportMatch[1],user),user); const input=await body(req), reason=clean(input.reason,80); if(!reason) throw Object.assign(new Error("理由を選んでください"),{status:400}); db.prepare("INSERT INTO reports(id,reporter_id,project_id,reason,detail) VALUES(?,?,?,?,?)").run(randomUUID(),user.id,reportMatch[1],reason,clean(input.detail,1000)); return send(res,201,{ok:true}); }

      if (path === "/api/me/notifications"&&req.method==="GET") { const user=requireUser(db,req); return send(res,200,{notifications:db.prepare("SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50").all(user.id)}); }
      if (path === "/api/me/notifications/read"&&req.method==="POST") { const user=requireUser(db,req); db.prepare("UPDATE notifications SET is_read=1 WHERE user_id=?").run(user.id); return send(res,200,{ok:true}); }
      if (path === "/api/me/bookmarks"&&req.method==="GET") { const user=requireUser(db,req); const rows=db.prepare(`SELECT p.*,u.display_name author_name,0 branch_count,0 comment_count,1 bookmarked FROM bookmarks b JOIN projects p ON p.id=b.project_id JOIN users u ON u.id=p.author_id WHERE b.user_id=? ORDER BY b.created_at DESC`).all(user.id); return send(res,200,{projects:rows.filter(p=>canRead(p,user)).map(serializeProject)}); }
      if (path === "/api/admin/reports"&&req.method==="GET") { const user=requireUser(db,req); if(user.role!=="admin") throw Object.assign(new Error("管理者権限が必要です"),{status:403}); return send(res,200,{reports:db.prepare(`SELECT r.*,p.title,u.display_name reporter_name FROM reports r JOIN projects p ON p.id=r.project_id JOIN users u ON u.id=r.reporter_id ORDER BY r.created_at DESC`).all()}); }
      const adminMatch=path.match(/^\/api\/admin\/reports\/([^/]+)$/);
      if(adminMatch&&req.method==="PATCH") { const user=requireUser(db,req); if(user.role!=="admin") throw Object.assign(new Error("管理者権限が必要です"),{status:403}); const input=await body(req), status=["open","reviewing","resolved","dismissed"].includes(input.status)?input.status:"reviewing"; db.prepare("UPDATE reports SET status=?,resolved_at=CASE WHEN ? IN ('resolved','dismissed') THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=?").run(status,status,adminMatch[1]); return send(res,200,{ok:true}); }

      if (path.startsWith("/api/")) throw Object.assign(new Error("APIが見つかりません"),{status:404});
      const uploadPrefix="/uploads/";
      if(path.startsWith(uploadPrefix)) {
        const user=sessionUser(db,req);
        const refs=db.prepare('SELECT author_id,visibility,status FROM projects WHERE asset_url=? OR cover_url=?').all(path,path);
        if(!refs.some(p=>(p.status==='published'&&p.visibility!=='private')||p.author_id===user?.id||user?.role==='admin')) throw Object.assign(new Error('ファイルが見つからないか閲覧できません'),{status:404});
        res.setHeader('cache-control','private, no-store');
        if(['.txt','.json','.pdf'].includes(extname(path))) res.setHeader('content-disposition',`attachment; filename="${path.split('/').pop()}"`);
      }
      let file;
      if(path.startsWith(uploadPrefix)) file=resolve(dataDir,"uploads",path.slice(uploadPrefix.length));
      else file=resolve(staticDir,path==="/"?"index.html":`.${path}`);
      const base=path.startsWith(uploadPrefix)?resolve(dataDir,"uploads"):resolve(staticDir);
      if(!file.startsWith(base+sep)&&file!==base) throw Object.assign(new Error("Not found"),{status:404});
      if(!existsSync(file)||!statSync(file).isFile()) { if(!extname(path)) file=resolve(staticDir,"index.html"); else throw Object.assign(new Error("Not found"),{status:404}); }
      res.writeHead(200,{"content-type":mime(file),"cache-control":path.startsWith(uploadPrefix)?'private, no-store':file.endsWith("index.html")?"no-store":"public, max-age=3600"}); res.end(readFileSync(file));
    } catch(error) { send(res,error.status||500,{error:error.status?error.message:"サーバーエラーが発生しました"}); if(!error.status) console.error(error); }
  });
  server.on("close",()=>db.close());
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const server=createAppServer(); const port=Number(process.env.PORT||5173); const host=process.env.HOST||"127.0.0.1";
  server.listen(port,host,()=>console.log(`誰かの未完成プロジェクト running at http://${host}:${port}`));
}
