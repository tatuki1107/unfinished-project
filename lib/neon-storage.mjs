import { randomUUID } from 'node:crypto';
import { get, put, del, presignUrl, issueSignedToken } from '@vercel/blob';
import { generateClientTokenFromReadWriteToken } from '@vercel/blob/client';
import { validateUpload,MAX_FILE_BYTES } from '../upload-validation.mjs';
import { canRead } from '../cloud-server.mjs';
import { fail,json,input } from './neon-auth.mjs';

const formats={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',mp3:'audio/mpeg',wav:'audio/wav',ogg:'audio/ogg',pdf:'application/pdf',txt:'text/plain',json:'application/json'};
const validId=id=>/^[a-f0-9-]{36}$/i.test(id);
export function createNeonStorage(db) {
  return async(req,res,path,method,user)=>{
    if(path==='/api/uploads/sign'&&method==='POST'){
      if(!user)fail(401,'ログインが必要です');
      const data=await input(req),name=String(data.name||'').slice(0,180),extension=name.split('.').pop().toLowerCase(),type=formats[extension],kind=data.kind==='cover'?'cover':'asset';
      if(!type||kind==='cover'&&!type.startsWith('image/')||!Number.isInteger(data.size)||data.size<1||data.size>MAX_FILE_BYTES)fail(400,'ファイル形式またはサイズが不正です');
      const [count]=await db.sql.query("SELECT count(*)::int AS n FROM public.uploads WHERE owner_id=$1 AND created_at>now()-interval '1 hour'",[user.id]);
      if(count.n>=20)fail(429,'1時間に登録できるファイル数を超えています');
      const id=randomUUID(),pathname=`${user.id}/pending/${id}.${extension}`;
      await db.sql.query('INSERT INTO public.uploads(id,owner_id,object_path,original_name,media_type,byte_size,kind) VALUES ($1,$2,$3,$4,$5,$6,$7)',[id,user.id,pathname,name,type,data.size,kind]);
      const token=await generateClientTokenFromReadWriteToken({pathname,allowedContentTypes:[type],maximumSizeInBytes:data.size,validUntil:Date.now()+10*60*1000,addRandomSuffix:false,allowOverwrite:false});
      return json(res,200,{id,pathname,token,type});
    }
    const verify=path.match(/^\/api\/uploads\/([^/]+)\/verify$/),download=path.match(/^\/uploads\/([^/]+)$/);
    const id=verify?.[1]||download?.[1];if(!validId(id))fail(404,'ファイルが見つかりません');
    const [row]=await db.sql.query('SELECT * FROM public.uploads WHERE id=$1',[id]);if(!row)fail(404,'ファイルが見つかりません');
    if(verify&&method==='POST'){
      if(!user||row.owner_id!==user.id)fail(404,'ファイルが見つかりません');
      if(row.status==='verified')return json(res,200,{id});
      if(row.status!=='pending')fail(400,'ファイルを再選択してください');
      const file=await get(row.object_path,{access:'private',useCache:false});
      if(!file||file.statusCode!==200)fail(400,'アップロードが完了していません');
      const bytes=Buffer.from(await new Response(file.stream).arrayBuffer());
      if(bytes.length!==row.byte_size||bytes.length>MAX_FILE_BYTES)fail(400,'ファイルサイズが一致しません');
      const validated=validateUpload({name:row.original_name,type:row.media_type,data:bytes.toString('base64')},row.kind==='cover');
      const finalPath=`${user.id}/verified/${id}${validated.ext}`;
      await put(finalPath,validated.bytes,{access:'private',contentType:validated.type,addRandomSuffix:false,allowOverwrite:false});
      await db.sql.query("UPDATE public.uploads SET object_path=$1,status='verified' WHERE id=$2 AND status='pending'",[finalPath,id]);
      await del(row.object_path);return json(res,200,{id});
    }
    if(download&&method==='GET'){
      if(!['verified','attached'].includes(row.status))fail(404,'ファイルが見つかりません');
      const refs=await db.sql.query('SELECT * FROM public.projects WHERE cover_url=$1 OR asset_url=$1',[`/uploads/${id}`]);
      if(!refs.some(p=>canRead(p,user)))fail(404,'ファイルが見つからないか閲覧できません');
      const delegation=await issueSignedToken({pathname:row.object_path,operations:['get'],validUntil:Date.now()+60000});
      const {presignedUrl}=await presignUrl(delegation,{operation:'get',pathname:row.object_path,access:'private'});
      res.writeHead(302,{location:presignedUrl,'cache-control':'private, no-store'});res.end();return;
    }
    fail(405,'対応していない操作です');
  };
}
