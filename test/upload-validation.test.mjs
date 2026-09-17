import test from 'node:test';
import assert from 'node:assert/strict';
import {validateUpload,validateExternalUrl,MAX_FILE_BYTES} from '../upload-validation.mjs';
const file=(name,type,bytes)=>({name,type,data:Buffer.from(bytes).toString('base64')});
test('uploads reject spoofed signatures, invalid JSON, non-UTF8 and mismatched cover types',()=>{
 assert.throws(()=>validateUpload(file('x.png','image/png','fake')),/中身/);
 assert.throws(()=>validateUpload(file('x.json','application/json','{')),/JSON/);
 assert.throws(()=>validateUpload(file('x.txt','text/plain',[255,255])),/UTF-8/);
 assert.throws(()=>validateUpload(file('x.txt','text/plain','text'),true),/カバー/);
 assert.throws(()=>validateUpload(file('x.txt','image/png','text')),/一致/);
 assert.throws(()=>validateUpload({name:'x.txt',type:'text/plain',data:'!!!!'}),/不正/);
 assert.equal(validateUpload(file('x.txt','','本文')).type,'text/plain');
});
test('size limit accepts exactly 6MiB and rejects above limit',()=>{
 assert.equal(validateUpload(file('x.txt','text/plain',Buffer.alloc(MAX_FILE_BYTES,65))).bytes.length,MAX_FILE_BYTES);
 assert.throws(()=>validateUpload(file('x.txt','text/plain',Buffer.alloc(MAX_FILE_BYTES+1,65))),/6MiB/);
});
test('external links accept public HTTPS and reject credentials, script and local addresses',()=>{
 assert.equal(validateExternalUrl('https://github.com/example/project'),'https://github.com/example/project');
 for(const url of ['javascript:alert(1)','http://example.com','https://user:pass@example.com','https://127.0.0.1','https://[::1]','https://localhost','https://service.local'])assert.throws(()=>validateExternalUrl(url));
 assert.equal(validateExternalUrl(''),null);
});
