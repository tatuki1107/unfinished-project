export const MAX_FILE_BYTES=6*1024*1024;
const fail=message=>{throw Object.assign(new Error(message),{status:400});};
const formats={png:['image/png','.png'],jpg:['image/jpeg','.jpg'],webp:['image/webp','.webp'],mp3:['audio/mpeg','.mp3'],wav:['audio/wav','.wav'],ogg:['audio/ogg','.ogg'],pdf:['application/pdf','.pdf'],txt:['text/plain','.txt'],json:['application/json','.json']};
export function validateExternalUrl(value){
 if(value==null||value==='')return null;
 if(typeof value!=='string'||value.length>2048)fail('外部URLは2048文字以内で入力してください');
 let url;try{url=new URL(value.trim());}catch{fail('有効なHTTPSのURLを入力してください');}
 if(url.protocol!=='https:'||url.username||url.password)fail('外部URLは認証情報を含まないHTTPSのURLにしてください');
 const host=url.hostname.toLowerCase();
 if(!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.includes(':')||/^[\d.]+$/.test(host))fail('公開サイトのHTTPS URLを入力してください');
 return url.href;
}
export function validateUpload(upload,cover=false){
 if(upload==null)return null;
 if(typeof upload.data!=='string')fail('ファイルデータが不正です');
 const encoded=upload.data.replace(/^data:[^;]+;base64,/, '');
 if(encoded.length>Math.ceil(MAX_FILE_BYTES/3)*4)fail('ファイルは6MiB以下にしてください');
 if(encoded.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded))fail('ファイルデータが不正です');
 const bytes=Buffer.from(encoded,'base64');
 if(bytes.toString('base64')!==encoded)fail('ファイルデータが不正です');
 if(!bytes.length||bytes.length>MAX_FILE_BYTES)fail('空のファイル、または6MiBを超えるファイルは登録できません');
 const name=String(upload.name||''); const extension=name.split('.').pop().toLowerCase();
 const key=extension==='jpeg'?'jpg':extension; const spec=formats[key];
 if(!spec||(cover&&!['png','jpg','webp'].includes(key)))fail(cover?'カバーはPNG・JPEG・WebPのみ対応しています':'対応形式: PNG・JPEG・WebP・MP3・WAV・OGG・PDF・TXT・JSON');
 const aliases={'audio/x-wav':'audio/wav','audio/wave':'audio/wav','audio/mp3':'audio/mpeg','application/ogg':'audio/ogg'};
 const claimed=aliases[upload.type]||upload.type;
 if(claimed&&claimed!=='application/octet-stream'&&claimed!==spec[0])fail('拡張子とファイル形式が一致していません');
 const ascii=(start,end)=>bytes.toString('ascii',start,end);
 let valid=true;
 if(key==='png')valid=bytes.length>=33&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&ascii(12,16)==='IHDR';
 if(key==='jpg')valid=bytes.length>4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255&&bytes.at(-2)===255&&bytes.at(-1)===217;
 if(key==='webp')valid=bytes.length>=20&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WEBP'&&['VP8 ','VP8L','VP8X'].includes(ascii(12,16));
 if(key==='wav')valid=bytes.length>=44&&ascii(0,4)==='RIFF'&&ascii(8,12)==='WAVE'&&bytes.includes(Buffer.from('fmt '))&&bytes.includes(Buffer.from('data'));
 if(key==='ogg')valid=bytes.length>=32&&ascii(0,4)==='OggS'&&(bytes.includes(Buffer.from('vorbis'))||bytes.includes(Buffer.from('OpusHead'))||bytes.includes(Buffer.from('Speex   ')));
 if(key==='mp3')valid=bytes.length>=10&&(ascii(0,3)==='ID3'||(bytes[0]===255&&(bytes[1]&0xe0)===0xe0&&(bytes[1]&6)!==0&&(bytes[2]&0xf0)!==0xf0));
 if(key==='pdf')valid=ascii(0,5)==='%PDF-'&&bytes.subarray(-1024).includes(Buffer.from('%%EOF'));
 if(key==='txt'||key==='json'){
  let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{fail('TXT・JSONはUTF-8で保存してください');}
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text))fail('テキストにバイナリデータが含まれています');
  if(key==='json')try{JSON.parse(text);}catch{fail('JSONの構文が不正です');}
 }
 if(!valid)fail('ファイルの中身が指定形式と一致しないか、壊れています');
 return {bytes,type:spec[0],ext:spec[1]};
}
